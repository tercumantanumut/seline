"""Accelerator wheel matrix resolver and snippet generator.

This module encapsulates a minimal compatibility matrix for precompiled
accelerator wheels (FlashAttention, SageAttention, Triton, xFormers) based on
the loscrossos approach. It produces a small requirements-style snippet with
platform guards that can be pip-installed inside Docker.

Scope: keep it intentionally small and conservative. We support the best-known
combos from the research:
- Python 3.12 or 3.13 with PyTorch 2.8.0 and CUDA 12.9 (recommended)
- Python 3.12 with PyTorch 2.7.1 and CUDA 12.9 (back-compat)

If inputs fall outside supported matrix, we mark unsupported and let caller
fallback to default behavior (no accelerators).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AcceleratorPlan:
    """Resolution result for an accelerator install plan.

    Attributes:
        supported: Whether the combo is supported by precompiled wheels.
        python_version: Resolved Python minor (e.g., '3.12').
        torch_version: Resolved PyTorch version (e.g., '2.8.0').
        cuda_variant: Resolved CUDA variant (e.g., 'cu129').
        lines: Requirements-style lines with platform guards and direct wheel URLs.
    """

    supported: bool
    python_version: str
    torch_version: str
    cuda_variant: str
    lines: list[str]  # requirements.txt-style lines with platform guards


class AcceleratorManager:
    """Resolve wheel URLs and generate a guarded requirements snippet.

    Minimal, hard-pinned URLs derived from loscrossos repos:
    - FlashAttention 2.8.3 (or 2.8.2 on Win for py3.13)
    - SageAttention 2.2.0
    - Triton 3.4.0 (linux) / triton-windows 3.4.0.post20 (win)
    - xFormers (from PyPI)
    """

    SUPPORTED_TORCH = {"2.8.0", "2.7.1"}
    SUPPORTED_PY = {"3.10", "3.11", "3.12", "3.13"}
    DEFAULT_TORCH = "2.8.0"
    DEFAULT_CUDA = "cu129"

    def resolve(
        self,
        *,
        python_version: str | None,
        torch_version: str | None,
        cuda_variant: str | None,
        accelerators: list[str] | None = None,
        enable_nunchaku: bool = False,
    ) -> AcceleratorPlan:
        """Return a plan with guarded requirement lines for the given combo."""
        py = (python_version or "3.12").split(".")
        py_minor = f"{py[0]}.{py[1]}" if len(py) >= 2 else "3.12"

        if py_minor not in self.SUPPORTED_PY:
            return AcceleratorPlan(
                False, py_minor, torch_version or "", cuda_variant or "", []
            )

        torch = torch_version or self.DEFAULT_TORCH
        if torch not in self.SUPPORTED_TORCH:
            return AcceleratorPlan(False, py_minor, torch, cuda_variant or "", [])

        cuda = cuda_variant or self.DEFAULT_CUDA
        if cuda != "cu129":
            # Only cu129 is encoded here to keep scope tight.
            return AcceleratorPlan(False, py_minor, torch, cuda, [])

        acc_set = {
            a.lower() for a in (accelerators or ["xformers", "triton", "flash", "sage"])
        }

        # Compute CP tag by python version
        cp_tag = {
            "3.10": "cp310",
            "3.11": "cp311",
            "3.12": "cp312",
            "3.13": "cp313",
        }.get(py_minor, "cp310")

        lines: list[str] = []

        # Pytorch index guards
        lines.append(
            "--extra-index-url=https://download.pytorch.org/whl/nightly/cpu ; sys_platform  == 'darwin'"
        )
        lines.append(
            "--extra-index-url=https://download.pytorch.org/whl/cu129 ; sys_platform  != 'darwin'"
        )

        # Note: Torch and companions are installed separately before accelerators
        # Only install additional torch-related packages here
        lines.append("torchsde")

        # xFormers
        if "xformers" in acc_set:
            lines.append("xformers ; sys_platform  != 'darwin'")

        # Triton
        if "triton" in acc_set:
            lines.append(
                "https://github.com/woct0rdho/triton-windows/releases/download/empty/triton-3.3.0-py3-none-any.whl ; sys_platform == 'win32' # tw"
            )
            # Preferred modern versions
            lines.append("triton-windows==3.4.0.post20 ; sys_platform == 'win32' # tw")
            lines.append("triton==3.4.0 ; sys_platform == 'linux'")

        # FlashAttention
        # Skip Flash-Attention when Nunchaku is enabled to avoid ABI conflicts
        # (Flash-Attention 2.8.2 for PyTorch 2.7 is incompatible with PyTorch 2.8)
        if ("flash" in acc_set or "flash-attn" in acc_set or "flashattention" in acc_set) and not enable_nunchaku:
            flash_version = "2.8.3"

            if torch == "2.8.0":
                if py_minor == "3.10":
                    # Python 3.10 wheels for torch 2.8.0
                    lines.append(
                        f"https://github.com/Dao-AILab/flash-attention/releases/download/v{flash_version}/flash_attn-{flash_version}+cu12torch2.8cxx11abiTRUE-"
                        f"{cp_tag}-{cp_tag}-linux_x86_64.whl ; sys_platform == 'linux' #egg2.8.0"
                    )
                elif py_minor == "3.11":
                    # Python 3.11 wheels for torch 2.8.0
                    lines.append(
                        f"https://github.com/Dao-AILab/flash-attention/releases/download/v{flash_version}/flash_attn-{flash_version}+cu12torch2.8cxx11abiTRUE-"
                        f"{cp_tag}-{cp_tag}-linux_x86_64.whl ; sys_platform == 'linux' #egg2.8.0"
                    )
                elif py_minor == "3.12":
                    # Win: loscrossos, Linux: Dao-AILab
                    win_flash = "2.8.3"
                    lines.append(
                        f"https://github.com/loscrossos/lib_flashattention/releases/download/v{win_flash}/flash_attn-{win_flash}+cu129torch2.8.0-"
                        f"{cp_tag}-{cp_tag}-win_amd64.whl ; sys_platform == 'win32' #egg2.8.0"
                    )
                    lines.append(
                        f"https://github.com/Dao-AILab/flash-attention/releases/download/v{flash_version}/flash_attn-{flash_version}+cu12torch2.8cxx11abiTRUE-"
                        f"{cp_tag}-{cp_tag}-linux_x86_64.whl ; sys_platform == 'linux' #egg2.8.0"
                    )
                else:  # 3.13
                    # Windows FA 2.8.2 for cp313 from loscrossos; Linux uses configured version
                    lines.append(
                        "https://github.com/loscrossos/lib_flashattention/releases/download/v2.8.2/flash_attn-2.8.2+cu129torch2.8.0-"
                        f"{cp_tag}-{cp_tag}-win_amd64.whl ; sys_platform == 'win32' #egg2.8.0"
                    )
                    linux_flash = "2.8.3"
                    lines.append(
                        f"https://github.com/Dao-AILab/flash-attention/releases/download/v{linux_flash}/flash_attn-{linux_flash}+cu12torch2.8cxx11abiTRUE-"
                        f"{cp_tag}-{cp_tag}-linux_x86_64.whl ; sys_platform == 'linux' #egg2.8.0"
                    )
            elif torch == "2.7.1" and py_minor in ["3.10", "3.11", "3.12"]:
                # FA 2.8.0 for 2.7.1 (from loscrossos)
                lines.append(
                    "https://github.com/loscrossos/lib_flashattention/releases/download/v2.8.0/flash_attn-2.8.0+cu129torch2.7.1-"
                    f"{cp_tag}-{cp_tag}-linux_x86_64.whl ; sys_platform == 'linux' #egg2.8.0"
                )
                lines.append(
                    "https://github.com/loscrossos/lib_flashattention/releases/download/v2.8.0/flash_attn-2.8.0+cu129torch2.7.1-"
                    f"{cp_tag}-{cp_tag}-win_amd64.whl ; sys_platform == 'win32' #egg2.8.0"
                )

        # SageAttention
        if "sage" in acc_set or "sageattention" in acc_set:
            if torch == "2.8.0":
                # Windows ABI3 wheel (woct0rdho), Linux loscrossos per python cp
                lines.append(
                    "https://github.com/woct0rdho/SageAttention/releases/download/v2.2.0-windows.post2/"
                    "sageattention-2.2.0+cu128torch2.8.0.post2-cp39-abi3-win_amd64.whl ; sys_platform == 'win32'  #egg:v2.2.2"
                )
                # Only Python 3.12 and 3.13 have Linux wheels available
                if py_minor in ["3.12", "3.13"]:
                    lines.append(
                        "https://github.com/loscrossos/lib_sageattention/releases/download/v2.2.0/"
                        f"sageattention-2.2.0+cu129torch280-{cp_tag}-{cp_tag}-linux_x86_64.whl ; sys_platform == 'linux' #egg:v2.2.2"
                    )
            elif torch == "2.7.1" and py_minor == "3.12":
                # Only Python 3.12 has wheels for torch 2.7.1
                lines.append(
                    "https://github.com/loscrossos/lib_sageattention/releases/download/v2.2.0/"
                    f"sageattention-2.2.0+cu129torch270-{cp_tag}-{cp_tag}-win_amd64.whl ; sys_platform == 'win32'  #egg:v2.2.2"
                )
                lines.append(
                    "https://github.com/loscrossos/lib_sageattention/releases/download/v2.2.0/"
                    f"sageattention-2.2.0+cu129torch270-{cp_tag}-{cp_tag}-linux_x86_64.whl ; sys_platform == 'linux' #egg:v2.2.2"
                )

        # Final helper used by many projects
        lines.append("accelerate >= 1.1.1")

        return AcceleratorPlan(True, py_minor, torch, cuda, lines)
