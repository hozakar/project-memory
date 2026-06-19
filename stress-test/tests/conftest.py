import pathlib
import subprocess
import sys
import pytest


@pytest.fixture(scope="session")
def generated(tmp_path_factory):
    out = tmp_path_factory.mktemp("generated")
    generate_py = pathlib.Path(__file__).parent.parent / "generate.py"
    subprocess.run(
        [
            sys.executable, str(generate_py),
            "--phases", "4",
            "--decisions", "4",
            "--time-years", "1",
            "--out", str(out),
        ],
        check=True,
        capture_output=True,
    )
    return out
