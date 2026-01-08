#!/usr/bin/env python3
"""
Z-Image Turbo FP8 Model Downloader

Downloads required models from HuggingFace.
Usage: python download_models.py [--target-dir /path/to/models]
"""

import argparse
import os
import sys
from pathlib import Path
from urllib.request import urlretrieve
from urllib.error import URLError


# Model definitions
MODELS = {
    "checkpoints": [
        {
            "name": "z-image-turbo-fp8-aio.safetensors",
            "url": "https://huggingface.co/SeeSee21/Z-Image-Turbo-AIO/resolve/main/z-image-turbo-fp8-aio.safetensors",
            "description": "Z-Image Turbo FP8 AIO Checkpoint (model + VAE + CLIP)",
        }
    ],
    "loras": [
        {
            "name": "z-image-detailer.safetensors",
            "url": "https://huggingface.co/SeeSee21/Z-Image-Turbo-AIO/resolve/main/z-image-detailer.safetensors",
            "description": "Z-Image Detailer LoRA",
        }
    ],
}


def download_with_progress(url: str, destination: Path) -> bool:
    """Download a file with progress indication."""
    
    def reporthook(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            percent = min(100, downloaded * 100 / total_size)
            mb_downloaded = downloaded / (1024 * 1024)
            mb_total = total_size / (1024 * 1024)
            sys.stdout.write(f"\r  Progress: {percent:.1f}% ({mb_downloaded:.1f}/{mb_total:.1f} MB)")
            sys.stdout.flush()
    
    try:
        urlretrieve(url, destination, reporthook)
        print()  # New line after progress
        return True
    except URLError as e:
        print(f"\n  Error: {e}")
        return False


def download_models(target_dir: Path, force: bool = False) -> bool:
    """Download all required models."""
    
    print("=" * 50)
    print("Z-Image Turbo FP8 Model Downloader")
    print("=" * 50)
    print(f"Target directory: {target_dir}")
    print()
    
    success = True
    
    for subdir, models in MODELS.items():
        model_dir = target_dir / subdir
        model_dir.mkdir(parents=True, exist_ok=True)
        
        for model in models:
            model_path = model_dir / model["name"]
            
            if model_path.exists() and not force:
                print(f"✓ {model['name']} already exists")
                continue
            
            print(f"Downloading: {model['description']}")
            print(f"  URL: {model['url']}")
            print(f"  Destination: {model_path}")
            
            if download_with_progress(model["url"], model_path):
                print(f"✓ Downloaded: {model['name']}")
            else:
                print(f"✗ Failed: {model['name']}")
                success = False
    
    print()
    print("=" * 50)
    if success:
        print("All models downloaded successfully!")
    else:
        print("Some models failed to download.")
    print("=" * 50)
    
    return success


def main():
    parser = argparse.ArgumentParser(description="Download Z-Image Turbo FP8 models")
    parser.add_argument(
        "--target-dir",
        type=Path,
        default=Path("./ComfyUI/models"),
        help="Target directory for models (default: ./ComfyUI/models)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download even if models exist",
    )
    
    args = parser.parse_args()
    
    success = download_models(args.target_dir, args.force)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
