#!/usr/bin/env python3
"""ComfyUI Workflow to Docker Translator - Main CLI Interface."""

import json
import logging
from pathlib import Path

import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

from src.api.generator import WorkflowAPIGenerator
from src.containers.custom_node_installer import CustomNodeInstaller
from src.containers.docker_manager import DockerManager
from src.containers.dockerfile_builder import DockerfileBuilder
from src.db.database import get_database, init_db
from src.db.repositories import BuildRepository, WorkflowRepository
from src.workflows.analyzer import NodeAnalyzer
from src.workflows.dependencies import DependencyExtractor
from src.workflows.parser import WorkflowParser
from src.workflows.validator import WorkflowValidator

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Initialize CLI
app = typer.Typer(
    name="comfyui-deploy",
    help="Transform ComfyUI workflows into production-ready Docker containers",
)
console = Console()


def generate_html_documentation(
    workflow_name: str,
    parameters: list,
    dependencies: dict,
    custom_nodes: list,
    docker_image: str,
    models_path: str | None,
    use_cuda: bool = False,
) -> str:
    """Generate HTML documentation for the workflow."""

    # Generate parameter rows
    param_rows = ""
    for param in parameters:
        required_badge = (
            '<span class="badge bg-danger">Required</span>'
            if param.get("required")
            else '<span class="badge bg-secondary">Optional</span>'
        )
        default_val = (
            f'<code>{param.get("default")}</code>'
            if param.get("default") is not None
            else "-"
        )
        constraints = []
        if param.get("minimum") is not None:
            constraints.append(f"Min: {param['minimum']}")
        if param.get("maximum") is not None:
            constraints.append(f"Max: {param['maximum']}")
        if param.get("enum"):
            constraints.append(f"Values: {', '.join(param['enum'])}")
        constraint_str = "<br>".join(constraints) if constraints else "-"

        param_rows += f"""
        <tr>
            <td><code>{param['name']}</code></td>
            <td><span class="badge bg-info">{param['type']}</span></td>
            <td>{required_badge}</td>
            <td>{default_val}</td>
            <td>{param.get('description', '-')}</td>
            <td>{constraint_str}</td>
        </tr>
        """

    # Generate model list
    model_list = ""
    for model_type, models in dependencies.get("models", {}).items():
        if models:
            for model in models:
                model_list += f"<li><strong>{model_type}:</strong> {model}</li>"

    # Generate custom node list
    custom_node_list = ""
    for node in custom_nodes:
        custom_node_list += f'<li><strong>{node.name}:</strong> <a href="{node.repository}" target="_blank">{node.repository}</a></li>'

    # Docker run command
    docker_run_cmd = f"docker run -d --name {workflow_name} -p 8188:8188"
    if models_path:
        docker_run_cmd += f" -v {models_path}:/app/ComfyUI/models"
    # Only add GPU support if CUDA is available (not on macOS)
    import platform

    if use_cuda and platform.system() != "Darwin":
        docker_run_cmd += " --gpus all"
    docker_run_cmd += f" {docker_image}"

    html = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{workflow_name} - ComfyUI Workflow Documentation</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }}
        .hero {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 3rem 0; }}
        .card {{ box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: none; margin-bottom: 2rem; }}
        .card-header {{ background: #f8f9fa; font-weight: bold; }}
        code {{ background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }}
        pre {{ background: #2d2d2d; color: #f8f8f2; padding: 1rem; border-radius: 5px; }}
        .badge {{ margin-right: 5px; }}
        .table th {{ background: #f8f9fa; }}
        .copy-btn {{ position: absolute; top: 10px; right: 10px; }}
    </style>
</head>
<body>
    <div class="hero">
        <div class="container">
            <h1 class="display-4">{workflow_name}</h1>
            <p class="lead">ComfyUI Workflow API Documentation</p>
        </div>
    </div>

    <div class="container mt-4">
        <!-- Quick Start -->
        <div class="card">
            <div class="card-header">
                <h3>🚀 Quick Start</h3>
            </div>
            <div class="card-body">
                <h5>Run with Docker:</h5>
                <div class="position-relative">
                    <pre><code class="language-bash">{docker_run_cmd}</code></pre>
                </div>

                <h5 class="mt-3">Access the UI:</h5>
                <p>Open your browser and navigate to: <a href="http://localhost:8188" target="_blank">http://localhost:8188</a></p>
            </div>
        </div>

        <!-- API Parameters -->
        <div class="card">
            <div class="card-header">
                <h3>📝 API Parameters</h3>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Required</th>
                                <th>Default</th>
                                <th>Description</th>
                                <th>Constraints</th>
                            </tr>
                        </thead>
                        <tbody>
                            {param_rows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Dependencies -->
        <div class="card">
            <div class="card-header">
                <h3>📦 Dependencies</h3>
            </div>
            <div class="card-body">
                <h5>Required Models:</h5>
                <ul>
                    {model_list if model_list else '<li>No specific models required</li>'}
                </ul>

                <h5>Custom Nodes:</h5>
                <ul>
                    {custom_node_list if custom_node_list else '<li>No custom nodes required</li>'}
                </ul>
            </div>
        </div>

        <!-- API Example -->
        <div class="card">
            <div class="card-header">
                <h3>💻 API Example</h3>
            </div>
            <div class="card-body">
                <h5>Python Example:</h5>
                <pre><code class="language-python">import requests
import json

# API endpoint
url = "http://localhost:8188/api/prompt"

# Prepare the request
payload = {{
    "prompt": "Your prompt text here",
    "width": 1152,
    "height": 1152,
    # Add other parameters as needed
}}

# Send request
response = requests.post(url, json=payload)

if response.status_code == 200:
    result = response.json()
    print(f"Prompt ID: {{result['prompt_id']}}")
else:
    print(f"Error: {{response.status_code}}")
</code></pre>
            </div>
        </div>

        <!-- Docker Details -->
        <div class="card">
            <div class="card-header">
                <h3>🐳 Docker Details</h3>
            </div>
            <div class="card-body">
                <p><strong>Image:</strong> <code>{docker_image}</code></p>
                <p><strong>Exposed Port:</strong> 8188</p>
                {f'<p><strong>Models Volume:</strong> <code>{models_path}:/app/ComfyUI/models</code></p>' if models_path else ''}
                <p><strong>GPU Support:</strong> Enabled (requires NVIDIA Docker runtime)</p>
            </div>
        </div>

        <!-- Footer -->
        <div class="text-center py-4 text-muted">
            <small>Generated by ComfyUI Workflow to Docker Translator</small>
        </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-bash.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-python.min.js"></script>
</body>
</html>
"""
    return html


@app.command()
def build_workflow(
    workflow_path: Path = typer.Argument(
        ..., help="Path to ComfyUI workflow JSON file"
    ),
    output_dir: Path = typer.Option(
        Path("./build"), help="Output directory for Dockerfile and artifacts"
    ),
    image_name: str = typer.Option(
        "comfyui-workflow", help="Name for the Docker image"
    ),
    tag: str = typer.Option("latest", help="Tag for the Docker image"),
    build_image: bool = typer.Option(
        True, help="Build Docker image after generating Dockerfile"
    ),
    push: bool = typer.Option(False, help="Push image to registry after building"),
    custom_node_repos: str = typer.Option(
        None,
        help="Custom node repositories in format 'NodeName1=repo1,NodeName2=repo2'",
    ),
    no_interactive: bool = typer.Option(
        False, help="Skip interactive prompts for missing custom nodes"
    ),
    comprehensive_lookup: bool = typer.Option(
        True,
        help="Use comprehensive NODE_CLASS_MAPPINGS analysis (slower but more accurate)",
    ),
    use_comfyui_json: bool = typer.Option(
        True,
        help="Use comfyui-json library for better custom node resolution (recommended)",
    ),
    registry: str | None = typer.Option(None, help="Registry URL for pushing image"),
    models_path: str | None = typer.Option(
        None, help="Path to your ComfyUI models folder (will be mounted as volume)"
    ),
    enable_nunchaku: bool = typer.Option(
        False, help="Enable Nunchaku acceleration (installs ComfyUI-nunchaku)"
    ),
    nunchaku_models_path: str | None = typer.Option(
        None, help="Optional path for 4-bit models used by Nunchaku"
    ),
    python_version: str = typer.Option(
        "3.12", help="Python version to use (3.10, 3.11, 3.12, 3.13)"
    ),
):
    """Build a Docker container from a ComfyUI workflow."""
    console.print(f"[bold blue]Processing workflow:[/bold blue] {workflow_path}")

    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Step 1: Parse workflow
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
            task = progress.add_task("Parsing workflow...", total=None)

            with open(workflow_path) as f:
                workflow_data = json.load(f)

            parser = WorkflowParser()
            parser.parse(workflow_data)  # Result not needed, just parse
            progress.update(task, completed=True)
            console.print("[green]✓[/green] Workflow parsed successfully")

        # Step 2: Validate workflow
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
            task = progress.add_task("Validating workflow...", total=None)

            validator = WorkflowValidator()
            validation_result = validator.validate(workflow_data)

            if not validation_result.is_valid:
                console.print("[red]✗ Workflow validation failed:[/red]")
                for error in validation_result.errors:
                    console.print(f"  - {error}")
                raise typer.Exit(1)

            progress.update(task, completed=True)
            console.print("[green]✓[/green] Workflow validated")

            if validation_result.warnings:
                console.print("[yellow]⚠ Warnings:[/yellow]")
                for warning in validation_result.warnings:
                    console.print(f"  - {warning}")

        # Step 3: Analyze workflow
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
            task = progress.add_task("Analyzing nodes...", total=None)

            analyzer = NodeAnalyzer()
            analysis = analyzer.analyze(workflow_data)

            progress.update(task, completed=True)
            console.print(f"[green]✓[/green] Found {analysis['total_nodes']} nodes")
            console.print(f"  - Builtin: {analysis['builtin_nodes']}")
            console.print(f"  - Custom: {analysis['custom_nodes']}")

        # Step 4: Extract dependencies
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
            task = progress.add_task("Extracting dependencies...", total=None)

            extractor = DependencyExtractor()
            dependencies = extractor.extract_all(workflow_data)

            progress.update(task, completed=True)
            console.print("[green]✓[/green] Dependencies extracted")

        # Step 5: Resolve custom node repositories
        custom_node_metadata = []
        if dependencies.get("custom_nodes"):
            # Show custom nodes summary before prompting
            console.print("\n[bold yellow]Custom Nodes Detected:[/bold yellow]")
            custom_node_names = []
            for node in dependencies["custom_nodes"]:
                if isinstance(node, dict):
                    node_name = node.get("class_type", str(node))
                else:
                    node_name = str(node)
                custom_node_names.append(node_name)
                console.print(f"  • {node_name}")

            if not no_interactive:
                console.print(
                    "\n[cyan]The workflow uses custom nodes that need to be installed.[/cyan]"
                )
                console.print(
                    "[cyan]You will be prompted to provide GitHub URLs for each custom node.[/cyan]\n"
                )

            # Don't use progress spinner during interactive prompts
            if not no_interactive:
                console.print("[cyan]Resolving custom node repositories...[/cyan]")

                # Parse manual repository mappings
                manual_repos = {}
                if custom_node_repos:
                    for pair in custom_node_repos.split(","):
                        if "=" in pair:
                            node_name, repo_url = pair.strip().split("=", 1)
                            manual_repos[node_name.strip()] = repo_url.strip()

                # Initialize custom node installer with caching
                cache_dir = output_dir / ".cache"
                installer = CustomNodeInstaller(cache_dir=str(cache_dir))

                # Resolve repositories with hybrid approach
                custom_node_metadata = installer.resolve_custom_node_repositories(
                    custom_nodes=dependencies["custom_nodes"],
                    manual_repos=manual_repos,
                    interactive=True,
                    use_comprehensive_lookup=comprehensive_lookup,
                    use_comfyui_json=use_comfyui_json,
                )

                console.print(
                    f"\n[green]✓[/green] Resolved {len(custom_node_metadata)} custom node repositories"
                )
            else:
                with Progress(
                    SpinnerColumn(),
                    TextColumn("[progress.description]{task.description}"),
                    console=console,
                ) as progress:
                    task = progress.add_task(
                        "Resolving custom node repositories...", total=None
                    )

                    # Parse manual repository mappings
                    manual_repos = {}
                    if custom_node_repos:
                        for pair in custom_node_repos.split(","):
                            if "=" in pair:
                                node_name, repo_url = pair.strip().split("=", 1)
                                manual_repos[node_name.strip()] = repo_url.strip()

                    # Initialize custom node installer with caching
                    cache_dir = output_dir / ".cache"
                    installer = CustomNodeInstaller(cache_dir=str(cache_dir))

                    # Resolve repositories with hybrid approach
                    custom_node_metadata = installer.resolve_custom_node_repositories(
                        custom_nodes=dependencies["custom_nodes"],
                        manual_repos=manual_repos,
                        interactive=False,
                        use_comprehensive_lookup=comprehensive_lookup,
                        use_comfyui_json=use_comfyui_json,
                    )

                    progress.update(task, completed=True)
                    console.print(
                        f"\n[green]✓[/green] Resolved {len(custom_node_metadata)} custom node repositories"
                    )

            # Display dependencies table
            table = Table(title="Workflow Dependencies")
            table.add_column("Type", style="cyan")
            table.add_column("Count", justify="right", style="green")
            table.add_column("Items", style="yellow")

            # Models
            model_count = sum(len(v) for v in dependencies["models"].values())
            if model_count > 0:
                model_items = []
                for model_type, models in dependencies["models"].items():
                    if models:
                        model_items.extend([f"{model_type}: {m}" for m in models])
                table.add_row("Models", str(model_count), ", ".join(model_items[:3]))

            # Custom nodes
            if dependencies["custom_nodes"]:
                custom_node_names = []
                for node in dependencies["custom_nodes"]:
                    if isinstance(node, dict):
                        custom_node_names.append(node.get("class_type", str(node)))
                    else:
                        custom_node_names.append(str(node))
                table.add_row(
                    "Custom Nodes",
                    str(len(dependencies["custom_nodes"])),
                    ", ".join(custom_node_names[:3]),
                )

            # Python packages
            if dependencies["python_packages"]:
                table.add_row(
                    "Python Packages",
                    str(len(dependencies["python_packages"])),
                    ", ".join(list(dependencies["python_packages"])[:3]),
                )

            console.print(table)

        # Step 5.5: Ask for models path if not provided and interactive mode
        if not models_path and not no_interactive and dependencies.get("models"):
            # Check if any models are required
            has_models = any(
                len(models) > 0 for models in dependencies["models"].values()
            )

            if has_models:
                console.print("\n[bold yellow]Models Required:[/bold yellow]")
                console.print("This workflow requires model files to run properly.")
                console.print(
                    "\n[cyan]Please provide the path to your ComfyUI models folder.[/cyan]"
                )
                console.print(
                    "[cyan]This folder will be mounted as a volume in the Docker container.[/cyan]"
                )
                console.print("\nExample: /home/username/ComfyUI/models")
                console.print(
                    "(Press Enter to skip if you'll configure it manually later)"
                )
                console.print("-" * 60)

                try:
                    user_input = input("Path to models folder: ").strip()
                    if user_input and Path(user_input).exists():
                        models_path = user_input
                        console.print(f"✅ Models path set: {models_path}")
                    elif user_input:
                        console.print(f"⚠️  Path does not exist: {user_input}")
                        console.print("⚠️  Skipping models volume configuration")
                    else:
                        console.print("⚠️  Skipping models volume configuration")
                except (KeyboardInterrupt, EOFError):
                    console.print("\n⚠️  Skipping models volume configuration")

        # Step 6: Generate Dockerfile
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
            task = progress.add_task("Generating Dockerfile...", total=None)

            # Initialize builder
            dockerfile_builder = DockerfileBuilder()

            # Detect if CUDA is available
            use_cuda = False
            import platform

            # macOS doesn't support NVIDIA CUDA
            if platform.system() == "Darwin":
                console.print(
                    "[yellow]⚠ macOS detected - using CPU (CUDA not supported)[/yellow]"
                )
                use_cuda = False
            else:
                try:
                    import subprocess

                    result = subprocess.run(
                        ["nvidia-smi"], capture_output=True, text=True
                    )
                    use_cuda = result.returncode == 0
                    if use_cuda:
                        console.print(
                            "[green]✓ NVIDIA GPU detected - using CUDA[/green]"
                        )
                    else:
                        console.print(
                            "[yellow]⚠ No NVIDIA GPU detected - using CPU[/yellow]"
                        )
                except FileNotFoundError:
                    console.print("[yellow]⚠ nvidia-smi not found - using CPU[/yellow]")

            # Use the build_for_workflow method which handles everything
            # Use devel image when Nunchaku is enabled (requires CUDA dev libraries)
            if use_cuda:
                if enable_nunchaku:
                    base_image = "nvidia/cuda:12.8.0-devel-ubuntu22.04"
                else:
                    base_image = "nvidia/cuda:12.8.0-runtime-ubuntu22.04"
            else:
                base_image = f"python:{python_version}-slim"

            dockerfile_content = dockerfile_builder.build_for_workflow(
                dependencies=dependencies,
                custom_nodes=custom_node_metadata,
                base_image=base_image,
                use_cuda=use_cuda,
                python_version=python_version,
                enable_nunchaku=enable_nunchaku,
                nunchaku_models_path=nunchaku_models_path,
                enable_accelerators=use_cuda,  # Enable accelerators when CUDA is available
                accelerators=["xformers", "triton", "flash", "sage"] if use_cuda else None,
            )
            dockerfile_path = output_dir / "Dockerfile"
            with open(dockerfile_path, "w") as f:
                f.write(dockerfile_content)

            progress.update(task, completed=True)
            console.print(f"[green]✓[/green] Dockerfile generated: {dockerfile_path}")

            # Save models path for docker run command
            if models_path:
                docker_run_cmd_path = output_dir / "docker_run.sh"
                with open(docker_run_cmd_path, "w") as f:
                    f.write("#!/bin/bash\n")
                    f.write("# Docker run command with models volume mount\n")
                    f.write("docker run -d \\\n")
                    f.write("  --name comfyui-workflow \\\n")
                    f.write("  -p 8188:8188 \\\n")
                    f.write(f"  -v {models_path}:/app/ComfyUI/models \\\n")
                    # Only add GPU support if CUDA is available and not on macOS
                    if use_cuda and platform.system() != "Darwin":
                        f.write("  --gpus all \\\n")
                    f.write(f"  {image_name}:{tag}\n")

                docker_run_cmd_path.chmod(0o755)
                console.print(
                    f"[green]✓[/green] Docker run script saved: {docker_run_cmd_path}"
                )
                console.print(
                    "[cyan]Run the container with: ./build-test/docker_run.sh[/cyan]"
                )

        # Extract API parameters for database storage
        api_generator = WorkflowAPIGenerator()
        parameters = api_generator.extract_input_parameters(workflow_data)

        # Convert parameters to JSON-serializable format
        param_list = []
        for p in parameters:
            param_dict = {
                "name": p.name,
                "type": str(p.type.value) if hasattr(p.type, "value") else str(p.type),
                "required": p.required,
                "default": p.default,
                "description": p.description,
            }
            if p.minimum is not None:
                param_dict["minimum"] = p.minimum
            if p.maximum is not None:
                param_dict["maximum"] = p.maximum
            if p.enum:
                param_dict["enum"] = p.enum
            param_list.append(param_dict)

        # Save workflow and build info to database
        # Initialize database with automatic table creation
        try:
            # Import models to ensure they're registered with SQLModel
            db = init_db(create_tables=True)
        except Exception as e:
            logger.warning(f"Database initialization warning: {e}")
            # Fallback to get_database if init_db fails
            db = get_database()

        workflow_id = None

        with db.get_session() as session:
            workflow_repo = WorkflowRepository(session)

            # Convert dependencies for database storage
            dependencies_for_db = dependencies.copy()
            if isinstance(dependencies_for_db.get("custom_nodes"), set):
                dependencies_for_db["custom_nodes"] = list(
                    dependencies_for_db["custom_nodes"]
                )
            if isinstance(dependencies_for_db.get("python_packages"), set):
                dependencies_for_db["python_packages"] = list(
                    dependencies_for_db["python_packages"]
                )
            for key in dependencies_for_db.get("models", {}):
                if isinstance(dependencies_for_db["models"][key], set):
                    dependencies_for_db["models"][key] = list(
                        dependencies_for_db["models"][key]
                    )

            # Check if workflow exists or create new
            existing = workflow_repo.get_by_name(workflow_path.stem)
            if existing:
                workflow_id = existing.id
                console.print(
                    f"[cyan]Using existing workflow from database: {workflow_id[:8]}[/cyan]"
                )
            else:
                workflow = workflow_repo.create(
                    name=workflow_path.stem,
                    definition=workflow_data,
                    dependencies=dependencies_for_db,
                    parameters=param_list,
                    description="Auto-saved from build-workflow command",
                )
                workflow_id = workflow.id
                console.print(
                    f"[green]Workflow saved to database: {workflow_id[:8]}[/green]"
                )

        # Step 7: Build Docker image (if requested)
        if build_image:
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                console=console,
            ) as progress:
                task = progress.add_task("Building Docker image...", total=None)

                build_id = None
                try:
                    docker_manager = DockerManager()

                    # Create build record in database
                    with db.get_session() as session:
                        build_repo = BuildRepository(session)

                        # Read Dockerfile content for tracking
                        with open(dockerfile_path) as f:
                            dockerfile_for_db = f.read()

                        build = build_repo.create_build(
                            workflow_id=workflow_id,
                            image_name=image_name,
                            tag=tag,
                            dockerfile=dockerfile_for_db,
                        )
                        build_id = build.id
                        console.print(
                            f"[cyan]Build tracked in database: {build_id[:8]}[/cyan]"
                        )

                    # Check if Docker is available
                    if not docker_manager.is_available():
                        console.print("[red]✗ Docker is not available[/red]")
                        console.print("Please ensure Docker daemon is running")

                        # Update build status as failed
                        with db.get_session() as session:
                            build_repo = BuildRepository(session)
                            build_repo.update_build_status(
                                build_id,
                                status="failed",
                                error="Docker daemon not available",
                            )
                        raise typer.Exit(1)

                    # Build image
                    full_image_name = f"{image_name}:{tag}"
                    if registry:
                        full_image_name = f"{registry}/{full_image_name}"

                    # Convert to absolute path for Docker
                    dockerfile_path = dockerfile_path.absolute()
                    context_path = output_dir.absolute()

                    success = docker_manager.build_image(
                        dockerfile_path=str(dockerfile_path),
                        context_path=str(context_path),
                        tag=full_image_name,
                    )

                    if success:
                        progress.update(task, completed=True)
                        console.print(
                            f"[green]✓[/green] Docker image built: {full_image_name}"
                        )

                        # Update build status as successful
                        with db.get_session() as session:
                            build_repo = BuildRepository(session)
                            build_repo.update_build_status(
                                build_id,
                                status="success",
                                logs="Build completed successfully",
                                image_size=2500000000,  # TODO: Get actual image size
                            )

                        # Push to registry if requested
                        if push and registry:
                            console.print(f"Pushing to registry: {registry}")
                            if docker_manager.push_image(full_image_name):
                                console.print(
                                    "[green]✓[/green] Image pushed to registry"
                                )
                            else:
                                console.print("[red]✗ Failed to push image[/red]")
                    else:
                        console.print("[red]✗ Failed to build Docker image[/red]")
                        raise typer.Exit(1)

                except Exception as e:
                    console.print(f"[red]✗ Docker build failed: {e}[/red]")

                    # Update build status as failed
                    if build_id:
                        with db.get_session() as session:
                            build_repo = BuildRepository(session)
                            build_repo.update_build_status(
                                build_id, status="failed", error=str(e)
                            )

                    raise typer.Exit(1) from e

        # Step 7: Generate API configuration and documentation
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
            task = progress.add_task(
                "Generating API configuration and documentation...", total=None
            )

            # API config already generated earlier
            api_config = api_generator.generate_endpoint_config(workflow_data)

            # Save API configuration
            api_config_path = output_dir / "api_config.json"
            with open(api_config_path, "w") as f:
                json.dump(
                    {
                        "endpoint": api_config.path,
                        "method": api_config.method,
                        "parameters": param_list,
                        "description": api_config.description,
                    },
                    f,
                    indent=2,
                )

            # Generate OpenAPI specification
            from src.api.openapi_generator import OpenAPIGenerator

            openapi_gen = OpenAPIGenerator()

            openapi_spec = openapi_gen.generate_full_spec(
                title=f"ComfyUI Workflow API - {workflow_path.stem}",
                version="1.0.0",
                workflows={workflow_path.stem: workflow_data},
            )

            # Save OpenAPI spec
            openapi_path = output_dir / "openapi.json"
            openapi_gen.save_spec(openapi_spec, str(openapi_path))

            # Generate HTML documentation
            html_doc = generate_html_documentation(
                workflow_name=workflow_path.stem,
                parameters=param_list,
                dependencies=dependencies,
                custom_nodes=custom_node_metadata,
                docker_image=f"{image_name}:{tag}",
                models_path=models_path,
                use_cuda=use_cuda,
            )

            # Save HTML documentation
            doc_path = output_dir / "documentation.html"
            with open(doc_path, "w") as f:
                f.write(html_doc)

            progress.update(task, completed=True)
            console.print(
                f"[green]✓[/green] API configuration saved: {api_config_path}"
            )
            console.print(f"[green]✓[/green] OpenAPI spec saved: {openapi_path}")
            console.print(f"[green]✓[/green] HTML documentation saved: {doc_path}")
            console.print(
                f"[cyan]View documentation: file://{doc_path.absolute()}[/cyan]"
            )

        console.print("\n[bold green]✨ Workflow processing complete![/bold green]")
        console.print(f"Output directory: {output_dir}")

    except FileNotFoundError:
        console.print(f"[red]Error: Workflow file not found: {workflow_path}[/red]")
        raise typer.Exit(1) from None
    except json.JSONDecodeError as e:
        console.print(f"[red]Error: Invalid JSON in workflow file: {e}[/red]")
        raise typer.Exit(1) from e
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        logger.exception("Unexpected error during workflow processing")
        raise typer.Exit(1) from e


@app.command()
def validate_workflow(
    workflow_path: Path = typer.Argument(
        ..., help="Path to ComfyUI workflow JSON file"
    ),
    strict: bool = typer.Option(False, help="Enable strict validation"),
):
    """Validate a ComfyUI workflow file."""
    console.print(f"[bold blue]Validating workflow:[/bold blue] {workflow_path}")

    try:
        with open(workflow_path) as f:
            workflow_data = json.load(f)

        validator = WorkflowValidator()
        result = validator.validate(workflow_data, strict=strict)

        if result.is_valid:
            console.print("[bold green]✓ Workflow is valid![/bold green]")
        else:
            console.print("[bold red]✗ Workflow validation failed[/bold red]")
            for error in result.errors:
                console.print(f"  [red]Error:[/red] {error}")

        if result.warnings:
            console.print("\n[yellow]Warnings:[/yellow]")
            for warning in result.warnings:
                console.print(f"  ⚠ {warning}")

        if result.metadata:
            console.print("\n[blue]Metadata:[/blue]")
            for key, value in result.metadata.items():
                console.print(f"  {key}: {value}")

    except FileNotFoundError:
        console.print(f"[red]Error: Workflow file not found: {workflow_path}[/red]")
        raise typer.Exit(1) from None
    except json.JSONDecodeError as e:
        console.print(f"[red]Error: Invalid JSON: {e}[/red]")
        raise typer.Exit(1) from e


@app.command()
def analyze_workflow(
    workflow_path: Path = typer.Argument(
        ..., help="Path to ComfyUI workflow JSON file"
    ),
):
    """Analyze a ComfyUI workflow and display detailed information."""
    console.print(f"[bold blue]Analyzing workflow:[/bold blue] {workflow_path}")

    try:
        with open(workflow_path) as f:
            workflow_data = json.load(f)

        # Parse and analyze
        parser = WorkflowParser()
        parsed = parser.parse(workflow_data)

        analyzer = NodeAnalyzer()
        analysis = analyzer.analyze(workflow_data)

        extractor = DependencyExtractor()
        dependencies = extractor.extract_all(workflow_data)

        # Display results
        console.print("\n[bold]Workflow Analysis[/bold]")
        console.print(f"Format: {parsed.format}")
        console.print(f"Total Nodes: {analysis['total_nodes']}")
        console.print(f"Builtin Nodes: {analysis['builtin_nodes']}")
        console.print(f"Custom Nodes: {analysis['custom_nodes']}")

        if analysis["custom_node_types"]:
            console.print("\n[bold]Custom Node Types:[/bold]")
            for node_type in analysis["custom_node_types"]:
                console.print(f"  • {node_type}")

        # Display dependencies
        console.print("\n[bold]Dependencies:[/bold]")

        if dependencies["models"]:
            console.print("\n[cyan]Models:[/cyan]")
            for model_type, models in dependencies["models"].items():
                if models:
                    console.print(f"  {model_type}:")
                    for model in models:
                        console.print(f"    • {model}")

        if dependencies["custom_nodes"]:
            console.print("\n[cyan]Custom Nodes:[/cyan]")
            for node in dependencies["custom_nodes"]:
                if isinstance(node, dict):
                    node_name = node.get("class_type", str(node))
                else:
                    node_name = str(node)
                console.print(f"  • {node_name}")

        if dependencies["python_packages"]:
            console.print("\n[cyan]Python Packages:[/cyan]")
            for package in dependencies["python_packages"]:
                console.print(f"  • {package}")

    except FileNotFoundError:
        console.print(f"[red]Error: Workflow file not found: {workflow_path}[/red]")
        raise typer.Exit(1) from None
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise typer.Exit(1) from e


@app.command()
def save_workflow(
    workflow_path: Path = typer.Argument(
        ..., help="Path to ComfyUI workflow JSON file"
    ),
    name: str | None = typer.Option(None, help="Workflow name (defaults to filename)"),
    description: str | None = typer.Option(None, help="Workflow description"),
):
    """Save a workflow to the database."""
    console.print(f"[bold blue]Saving workflow:[/bold blue] {workflow_path}")

    try:
        # Initialize database with automatic table creation
        try:
            # Import models to ensure they're registered with SQLModel
            db = init_db(create_tables=True)
        except Exception as e:
            logger.warning(f"Database initialization warning: {e}")
            # Fallback to get_database if init_db fails
            db = get_database()

        with open(workflow_path) as f:
            workflow_data = json.load(f)

        # Extract dependencies and parameters
        extractor = DependencyExtractor()
        dependencies = extractor.extract_all(workflow_data)

        # Convert sets to lists for JSON serialization
        if isinstance(dependencies.get("custom_nodes"), set):
            dependencies["custom_nodes"] = list(dependencies["custom_nodes"])
        if isinstance(dependencies.get("python_packages"), set):
            dependencies["python_packages"] = list(dependencies["python_packages"])
        for key in dependencies.get("models", {}):
            if isinstance(dependencies["models"][key], set):
                dependencies["models"][key] = list(dependencies["models"][key])

        api_generator = WorkflowAPIGenerator()
        parameters = api_generator.extract_input_parameters(workflow_data)
        param_dicts = [
            {
                "name": p.name,
                "type": p.type.value if hasattr(p.type, "value") else str(p.type),
                "default": p.default,
                "required": p.required,
                "description": p.description,
            }
            for p in parameters
        ]

        # Save to database
        with db.get_session() as session:
            repo = WorkflowRepository(session)
            workflow = repo.create(
                name=name or workflow_path.stem,
                definition=workflow_data,
                dependencies=dependencies,
                parameters=param_dicts,
                description=description,
            )

        console.print(f"[green]✓ Workflow saved with ID: {workflow.id}[/green]")
        console.print(f"  Name: {workflow.name}")
        console.print(f"  Version: {workflow.version}")

    except Exception as e:
        console.print(f"[red]Error saving workflow: {e}[/red]")
        raise typer.Exit(1) from e


@app.command()
def list_workflows(
    limit: int = typer.Option(10, help="Maximum number of workflows to show"),
    name_filter: str | None = typer.Option(None, help="Filter by name"),
):
    """List saved workflows from the database."""
    try:
        # Initialize database with automatic table creation
        try:
            # Import models to ensure they're registered with SQLModel
            db = init_db(create_tables=True)
        except Exception as e:
            logger.warning(f"Database initialization warning: {e}")
            # Fallback to get_database if init_db fails
            db = get_database()

        with db.get_session() as session:
            repo = WorkflowRepository(session)
            workflows = repo.list(limit=limit, name_filter=name_filter)

        if not workflows:
            console.print("[yellow]No workflows found[/yellow]")
            return

        # Create table
        from rich.table import Table

        table = Table(title="Saved Workflows")
        table.add_column("ID", style="cyan")
        table.add_column("Name", style="green")
        table.add_column("Version")
        table.add_column("Nodes")
        table.add_column("Created", style="yellow")

        for workflow in workflows:
            node_count = (
                len(workflow.definition) if isinstance(workflow.definition, dict) else 0
            )
            created = workflow.created_at.strftime("%Y-%m-%d %H:%M")
            table.add_row(
                workflow.id[:8],
                workflow.name,
                str(workflow.version),
                str(node_count),
                created,
            )

        console.print(table)

    except Exception as e:
        console.print(f"[red]Error listing workflows: {e}[/red]")
        raise typer.Exit(1) from e


@app.command()
def build_history(
    workflow_id: str | None = typer.Option(None, help="Filter by workflow ID"),
    limit: int = typer.Option(10, help="Maximum number of builds to show"),
):
    """Show container build history."""
    try:
        db = get_database()

        with db.get_session() as session:
            build_repo = BuildRepository(session)
            builds = build_repo.get_build_history(workflow_id=workflow_id, limit=limit)

        if not builds:
            console.print("[yellow]No builds found[/yellow]")
            return

        # Create table
        from rich.table import Table

        table = Table(title="Container Build History")
        table.add_column("Build ID", style="cyan")
        table.add_column("Workflow", style="green")
        table.add_column("Image")
        table.add_column("Status")
        table.add_column("Duration")
        table.add_column("Created", style="yellow")

        for build in builds:
            status_color = {
                "success": "green",
                "failed": "red",
                "building": "yellow",
                "pending": "blue",
            }.get(build.build_status, "white")

            duration = f"{build.build_duration:.1f}s" if build.build_duration else "-"
            created = build.created_at.strftime("%Y-%m-%d %H:%M")

            table.add_row(
                build.id[:8],
                build.workflow_id[:8],
                f"{build.image_name}:{build.tag}",
                f"[{status_color}]{build.build_status}[/{status_color}]",
                duration,
                created,
            )

        console.print(table)

    except Exception as e:
        console.print(f"[red]Error getting build history: {e}[/red]")
        raise typer.Exit(1) from e


@app.command()
def version():
    """Display version information."""
    console.print("[bold]ComfyUI Workflow to Docker Translator[/bold]")
    console.print("Version: 1.0.0")
    console.print("Python: 3.11+")
    console.print("License: MIT")


@app.command()
def api(
    host: str = typer.Option("0.0.0.0", "--host", help="API server host"),
    port: int = typer.Option(8000, "--port", help="API server port"),
    reload: bool = typer.Option(
        False, "--reload", help="Enable auto-reload for development"
    ),
):
    """Start the FastAPI server for workflow management."""
    import uvicorn

    console.print(f"[bold green]Starting API server on {host}:{port}[/bold green]")
    console.print("[yellow]Press CTRL+C to stop[/yellow]")

    uvicorn.run(
        "src.api.app:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info",
    )


if __name__ == "__main__":
    app()
