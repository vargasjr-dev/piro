"""Replicates the Modal serialize endpoint logic — run in CI to catch Python errors."""
import sys
import importlib.util
import tempfile
import os
import traceback

sys.path.insert(0, ".")  # make piro/ importable

for slug in ["scratch/ctm_model.py", "scratch/baseline_transformer_model.py"]:
    print(f"\n{'='*60}\n{slug}\n{'='*60}")
    model_source = open(slug).read()

    with tempfile.NamedTemporaryFile(suffix=".py", delete=False, mode="w") as f:
        f.write(model_source)
        tmp_path = f.name

    module_name = f"_piro_user_model_{slug.replace('/', '_')}"
    try:
        spec = importlib.util.spec_from_file_location(module_name, tmp_path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
    except Exception:
        print("EXEC ERROR:")
        traceback.print_exc()
        sys.modules.pop(module_name, None)
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        continue
    finally:
        sys.modules.pop(module_name, None)
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    from piro import PiroModel  # noqa: E402

    model_cls = None
    for attr_name in dir(module):
        obj = getattr(module, attr_name, None)
        if (
            obj
            and isinstance(obj, type)
            and issubclass(obj, PiroModel)
            and obj is not PiroModel
        ):
            model_cls = obj
            break

    if not model_cls:
        print("ERROR: no PiroModel subclass found")
        continue

    print(f"Found: {model_cls}")
    print(f"hyper_parameters: {model_cls.hyper_parameters}")

    try:
        result = model_cls.serialize()
        print(f"OK: parameterCount={result.parameter_count}")
        print(f"graph nodes: {len(result.graph.nodes) if result.graph else 0}")
    except Exception:
        print("SERIALIZE ERROR:")
        traceback.print_exc()
