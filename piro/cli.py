"""
piro/cli.py — CLI entry point for the piro package.

    piro login            — save API key to ~/.piro/config.json
    piro repos list       — list your repositories
    piro classes list     — list model classes
    piro classes push     — push model.py to a class
    piro classes pull     — pull model.py from a class
    piro benchmarks list  — list benchmarks
    piro benchmarks run   — trigger a benchmark run
    piro train            — launch a training run on the platform
    piro eval             — run a benchmark against a model
    piro deploy           — push a model class file to the platform
    piro infer            — run inference on a deployed model
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import click

from .client import PiroClient, PiroAPIError, CONFIG_PATH

DEFAULT_BASE_URL = "https://trainpiro.app"


def _get_client() -> PiroClient:
    try:
        return PiroClient()
    except RuntimeError as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


def _run(fn):
    """Wrap a CLI command, catching API errors and printing them cleanly."""
    try:
        fn()
    except PiroAPIError as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


def _print_table(rows: list[dict], columns: list[str]) -> None:
    """Print a simple aligned table."""
    if not rows:
        click.echo("  (none)")
        return
    widths = {col: max(len(col), max(len(str(r.get(col, ""))) for r in rows)) for col in columns}
    header = "  ".join(col.ljust(widths[col]) for col in columns)
    click.echo(header)
    click.echo("  ".join("-" * widths[col] for col in columns))
    for r in rows:
        click.echo("  ".join(str(r.get(col, "")).ljust(widths[col]) for col in columns))


# ── Login ─────────────────────────────────────────────────────────────────────


@click.group()
def cli() -> None:
    """Piro — model development framework and platform CLI."""


@cli.command()
@click.option("--api-key", prompt="API Key", help="Your Piro API key (piro_...)")
@click.option("--base-url", default=DEFAULT_BASE_URL, help="Platform base URL")
def login(api_key: str, base_url: str) -> None:
    """Save your API key to ~/.piro/config.json."""
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    config = {}
    if CONFIG_PATH.exists():
        config = json.loads(CONFIG_PATH.read_text())
    config["api_key"] = api_key
    config["base_url"] = base_url
    CONFIG_PATH.write_text(json.dumps(config, indent=2) + "\n")
    click.echo(f"Saved to {CONFIG_PATH}")


# ── Repos ─────────────────────────────────────────────────────────────────────


@cli.group()
def repos() -> None:
    """Manage repositories."""


@repos.command("list")
def repos_list() -> None:
    """List your repositories."""
    client = _get_client()
    repos = client.list_repos()
    _print_table(
        [{"id": r["id"], "name": r["name"], "slug": r.get("slug", ""), "owner": r.get("ownerUsername", "")} for r in repos],
        ["id", "name", "slug", "owner"],
    )
    client.close()


@repos.command("create")
@click.argument("repo_id")
@click.option("--name", required=True, help="Display name")
@click.option("--github-repository", required=True, help="GitHub URL or owner/repository")
@click.option("--description", help="Repo description")
def repos_create(
    repo_id: str,
    name: str,
    github_repository: str,
    description: str | None,
) -> None:
    """Create a new repository linked to an external GitHub repository."""
    client = _get_client()
    client.create_repo(repo_id, name, github_repository, description)
    click.echo(f"Created repository: {repo_id}")
    client.close()


@repos.command("link")
@click.argument("repo_id")
@click.option("--github-repository", required=True, help="GitHub URL or owner/repository")
def repos_link(repo_id: str, github_repository: str) -> None:
    """Link an existing repository to its external GitHub repository."""
    client = _get_client()
    client.link_repo(repo_id, github_repository)
    click.echo(f"Linked repository: {repo_id}")
    client.close()


# ── Classes ─


@cli.group()
def classes() -> None:
    """Manage model classes (architectures)."""


@classes.command("list")
def classes_list() -> None:
    """List model classes."""
    client = _get_client()
    classes = client.list_classes()
    _print_table(
        [{"id": c["id"], "name": c["name"], "slug": c.get("slug", ""), "params": c.get("parameterCount", 0)} for c in classes],
        ["id", "name", "slug", "params"],
    )
    client.close()


@classes.command("pull")
@click.argument("class_id")
@click.option("--out", default="model.py", help="Output file path")
def classes_pull(class_id: str, out: str) -> None:
    """Pull model.py from a class."""
    client = _get_client()
    content = client.pull_class_file(class_id)
    Path(out).write_text(content)
    click.echo(f"Pulled {len(content):,} bytes → {out}")
    client.close()


@classes.command("push")
@click.argument("class_id")
@click.option("--file", "file_", default="model.py", help="File to push")
def classes_push(class_id: str, file_: str) -> None:
    """Push model.py to a class."""
    client = _get_client()
    content = Path(file_).read_text()
    client.push_class_file(class_id, content)
    click.echo(f"Pushed {len(content):,} bytes → {class_id}")
    client.close()


@classes.command("serialize")
@click.argument("class_id")
@click.option("--bust", is_flag=True, help="Bust the serialize cache")
def classes_serialize(class_id: str, bust: bool) -> None:
    """Serialize a model class to a ModelManifest."""
    client = _get_client()
    manifest = client.serialize_class(class_id, bust=bust)
    click.echo(json.dumps(manifest, indent=2))
    client.close()


# ── Benchmarks ────────────────────────────────────────────────────────────────


@cli.group()
def benchmarks() -> None:
    """Manage benchmarks."""


@benchmarks.command("list")
def benchmarks_list() -> None:
    """List benchmarks."""
    client = _get_client()
    benchmarks = client.list_benchmarks()
    _print_table(
        [{"id": b["id"], "name": b["name"], "slug": b.get("slug", "")} for b in benchmarks],
        ["id", "name", "slug"],
    )
    client.close()


@benchmarks.command("pull")
@click.argument("benchmark_id")
@click.option("--out", default="script.py", help="Output file path")
def benchmarks_pull(benchmark_id: str, out: str) -> None:
    """Pull the eval script for a benchmark."""
    client = _get_client()
    content = client.pull_benchmark_script(benchmark_id)
    Path(out).write_text(content)
    click.echo(f"Pulled {len(content):,} bytes → {out}")
    client.close()


@benchmarks.command("push")
@click.argument("benchmark_id")
@click.option("--file", "file_", default="script.py", help="File to push")
def benchmarks_push(benchmark_id: str, file_: str) -> None:
    """Push an eval script to a benchmark."""
    client = _get_client()
    content = Path(file_).read_text()
    client.push_benchmark_script(benchmark_id, content)
    click.echo(f"Pushed {len(content):,} bytes → {benchmark_id}")
    client.close()


@benchmarks.command("run")
@click.argument("benchmark_id")
@click.option("--model", "model_id", help="Model ID to evaluate")
def benchmarks_run(benchmark_id: str, model_id: str | None) -> None:
    """Trigger a benchmark run."""
    client = _get_client()
    result = client.run_benchmark(benchmark_id, model_id)
    click.echo(f"Benchmark run triggered: {json.dumps(result, indent=2)}")
    client.close()


# ── Train ─────────────────────────────────────────────────────────────────────


@cli.command()
@click.option("--architecture", "architecture_path", required=True, help="Repository architecture path (e.g. architectures/ctm)")
@click.option("--dataset", "dataset_id", required=True, help="Generated dataset ID")
@click.option("--epochs", default=10, help="Number of training epochs")
@click.option("--name", "model_name", help="Name for the trained model")
def train(architecture_path: str, dataset_id: str, epochs: int, model_name: str | None) -> None:
    """Launch a training run on the Piro platform.

    \b
    piro train --architecture architectures/ctm --dataset <dataset-id> --epochs 20
    """
    client = _get_client()
    result = client.create_training_run(
        architecture_path=architecture_path,
        dataset_id=dataset_id,
        epochs=epochs,
        model_name=model_name,
    )
    click.echo(f"Training run created: {json.dumps(result, indent=2)}")
    client.close()


# ── Eval ──────────────────────────────────────────────────────────────────────


@cli.command()
@click.argument("benchmark_id")
@click.option("--model", "model_id", help="Model ID to evaluate (defaults to most recent)")
def eval(benchmark_id: str, model_id: str | None) -> None:
    """Run a benchmark against a model.

    \b
    piro eval persistent-memory --model <model-id>
    """
    client = _get_client()
    result = client.run_benchmark(benchmark_id, model_id)
    click.echo(f"Evaluation triggered: {json.dumps(result, indent=2)}")
    client.close()


# ── Deploy ────────────────────────────────────────────────────────────────────


@cli.command()
@click.argument("class_id")
@click.option("--file", "file_", default="model.py", help="Model file to deploy")
def deploy(class_id: str, file_: str) -> None:
    """Deploy a model class file to the platform.

    \b
    piro deploy <class-id> --file model.py
    """
    client = _get_client()
    content = Path(file_).read_text()
    client.push_class_file(class_id, content)
    click.echo(f"Deployed {len(content):,} bytes → class {class_id}")
    client.close()


# ── Infer ─────────────────────────────────────────────────────────────────────


@cli.command()
@click.argument("model_id")
@click.option("--prompt", required=True, help="Prompt text")
def infer(model_id: str, prompt: str) -> None:
    """Run inference on a deployed model.

    \b
    piro infer <model-id> --prompt "INC DEC INC INC DEC"
    """
    client = _get_client()
    result = client.infer(model_id, prompt)
    click.echo(json.dumps(result, indent=2))
    client.close()


def main() -> None:
    cli()


if __name__ == "__main__":
    main()
