import logging
from rich.logging import RichHandler


logging.basicConfig(
    level=logging.INFO, format="%(message)s", datefmt="[%X]", handlers=[RichHandler()]
)


logger = logging.getLogger("flux2-klein")
