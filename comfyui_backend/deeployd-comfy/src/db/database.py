"""Database connection and session management using SQLModel with SQLite."""

import logging
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Protocol

from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel

logger = logging.getLogger(__name__)


class Database:
    """Manages database connections and sessions."""

    def __init__(self, db_url: str | None = None):
        """Initialize database connection.

        Args:
            db_url: Database URL. Defaults to SQLite in project root.
        """
        if db_url is None:
            # Default to SQLite database in project root
            db_path = Path.cwd() / "comfyui_workflows.db"
            db_url = f"sqlite:///{db_path}"
            logger.info(f"Using SQLite database at {db_path}")

        self.db_url = db_url
        self.engine = self._create_engine()

    def _create_engine(self) -> Any:
        """Create SQLAlchemy engine with appropriate settings."""
        if self.db_url.startswith("sqlite"):
            # SQLite specific settings
            connect_args = {"check_same_thread": False}
            engine = create_engine(
                self.db_url,
                connect_args=connect_args,
                poolclass=StaticPool,  # Better for SQLite
                echo=False,  # Set to True for SQL debugging
            )

            # Enable foreign key constraints for SQLite
            @event.listens_for(engine, "connect")
            def set_sqlite_pragma(dbapi_conn: Any, _connection_record: Any) -> None:
                cursor = dbapi_conn.cursor()
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.close()

        else:
            # PostgreSQL or other databases
            engine = create_engine(
                self.db_url,
                echo=False,
                pool_pre_ping=True,  # Verify connections before using
                pool_size=5,
                max_overflow=10,
            )

        return engine

    def create_tables(self) -> None:
        """Create all tables in the database."""
        SQLModel.metadata.create_all(self.engine)
        logger.info("Database tables created")

    def drop_tables(self) -> None:
        """Drop all tables in the database. Use with caution."""
        SQLModel.metadata.drop_all(self.engine)
        logger.info("Database tables dropped")

    class SessionLike(Protocol):
        """Minimal database session protocol used by repositories."""

        def rollback(self) -> None:
            """Roll back the current transaction."""

        def close(self) -> None:
            """Close the session and release resources."""

    @contextmanager
    def get_session(self) -> Generator[SessionLike, None, None]:
        """Get a database session with automatic cleanup.

        Yields:
            SQLModel Session

        Example:
            with db.get_session() as session:
                session.add(workflow)
                session.commit()
        """
        session = Session(self.engine)
        try:
            yield session
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def get_session_dependency(self) -> Generator[SessionLike, None, None]:
        """Fastapi dependency for database sessions.

        Yields:
            SQLModel Session

        Example:
            @app.get("/workflows")
            def get_workflows(session: Session = Depends(db.get_session_dependency)):
                return session.query(Workflow).all()
        """
        with Session(self.engine) as session:
            yield session


# Global database instance
_db: Database | None = None


def get_database(db_url: str | None = None) -> Database:
    """Get or create the global database instance.

    Args:
        db_url: Optional database URL to override default

    Returns:
        Database instance
    """
    global _db
    if _db is None:
        _db = Database(db_url)
    return _db


def init_db(db_url: str | None = None, create_tables: bool = True) -> "Database":
    """Initialize the database.

    Args:
        db_url: Optional database URL
        create_tables: Whether to create tables immediately
    """
    db = get_database(db_url)
    if create_tables:
        db.create_tables()
    return db
