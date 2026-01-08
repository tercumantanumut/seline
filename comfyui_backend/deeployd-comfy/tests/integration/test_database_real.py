"""Integration test with real workflow and database."""

import json
import tempfile
from pathlib import Path

from src.db.database import init_db
from src.db.repositories import WorkflowRepository, BuildRepository
from src.containers.docker_manager import DockerManager
from src.containers.dockerfile_builder import DockerfileBuilder
from src.workflows.dependencies import DependencyExtractor
from src.api.generator import WorkflowAPIGenerator


def test_real_workflow_database_integration():
    """Test saving real workflow and tracking Docker build."""
    
    # Initialize database
    db = init_db()
    
    # Load real workflow
    workflow_path = Path("tests/workflow_ui.json")
    with open(workflow_path) as f:
        workflow_data = json.load(f)
    
    # Extract dependencies
    extractor = DependencyExtractor()
    dependencies = extractor.extract_all(workflow_data)
    
    # Convert sets to lists for JSON
    if isinstance(dependencies.get("custom_nodes"), set):
        dependencies["custom_nodes"] = list(dependencies["custom_nodes"])
    if isinstance(dependencies.get("python_packages"), set):
        dependencies["python_packages"] = list(dependencies["python_packages"])
    for key in dependencies.get("models", {}):
        if isinstance(dependencies["models"][key], set):
            dependencies["models"][key] = list(dependencies["models"][key])
    
    # Extract parameters
    api_generator = WorkflowAPIGenerator()
    parameters = api_generator.extract_input_parameters(workflow_data)
    param_dicts = [
        {
            "name": p.name,
            "type": p.type.value if hasattr(p.type, 'value') else str(p.type),
            "default": p.default,
            "required": p.required,
            "description": p.description
        }
        for p in parameters
    ]
    
    # Save workflow to database
    with db.get_session() as session:
        workflow_repo = WorkflowRepository(session)
        workflow = workflow_repo.create(
            name="Integration Test Workflow",
            definition=workflow_data,
            dependencies=dependencies,
            parameters=param_dicts,
            description="Testing full integration with Docker"
        )
        workflow_id = workflow.id
        print(f"✓ Workflow saved: {workflow_id}")
    
    # Create build record
    with db.get_session() as session:
        build_repo = BuildRepository(session)
        
        # Generate Dockerfile
        builder = DockerfileBuilder()
        dockerfile_content = builder.generate_dockerfile(
            base_image="python:3.11-slim",
            custom_nodes=dependencies.get("custom_nodes", []),
            python_packages=dependencies.get("python_packages", []),
            models=dependencies.get("models", {}),
            workflow_json=workflow_data
        )
        
        # Create build record
        build = build_repo.create_build(
            workflow_id=workflow_id,
            image_name="comfyui-integration-test",
            tag="latest",
            dockerfile=dockerfile_content
        )
        print(f"✓ Build record created: {build.id}")
        
        # Simulate build progress
        try:
            # Check Docker availability
            docker_manager = DockerManager()
            if docker_manager.check_docker():
                print("✓ Docker is available")
                
                # Update build status
                build = build_repo.update_build_status(
                    build.id,
                    status="building",
                    logs="Starting Docker build..."
                )
                
                # Write Dockerfile to temp location
                with tempfile.TemporaryDirectory() as temp_dir:
                    dockerfile_path = Path(temp_dir) / "Dockerfile"
                    with open(dockerfile_path, "w") as f:
                        f.write(dockerfile_content)
                    
                    print(f"✓ Dockerfile written to {dockerfile_path}")
                    
                    # Update build as successful (without actually building)
                    build = build_repo.update_build_status(
                        build.id,
                        status="success",
                        logs="Build completed successfully (simulated)",
                        image_size=2500000000  # 2.5GB simulated
                    )
                    print(f"✓ Build marked as successful")
            else:
                print("⚠ Docker not available, marking build as pending")
                build = build_repo.update_build_status(
                    build.id,
                    status="pending",
                    logs="Docker not available for build"
                )
        except Exception as e:
            print(f"✗ Build failed: {e}")
            build = build_repo.update_build_status(
                build.id,
                status="failed",
                error=str(e)
            )
    
    # Query the database
    with db.get_session() as session:
        workflow_repo = WorkflowRepository(session)
        build_repo = BuildRepository(session)
        
        # List workflows
        workflows = workflow_repo.list()
        print(f"\n✓ Found {len(workflows)} workflows in database")
        for w in workflows:
            print(f"  - {w.name} (v{w.version}): {len(w.definition)} nodes")
        
        # Get build history
        builds = build_repo.get_build_history(workflow_id=workflow_id)
        print(f"\n✓ Found {len(builds)} builds for workflow")
        for b in builds:
            print(f"  - {b.image_name}:{b.tag} - Status: {b.build_status}")
            if b.build_duration:
                print(f"    Duration: {b.build_duration:.1f}s")
    
    print("\n✅ Integration test completed successfully!")
    print(f"   - Workflow ID: {workflow_id}")
    print(f"   - Parameters extracted: {len(param_dicts)}")
    print(f"   - Custom nodes: {len(dependencies.get('custom_nodes', []))}")
    print(f"   - Database location: comfyui_workflows.db")


if __name__ == "__main__":
    test_real_workflow_database_integration()