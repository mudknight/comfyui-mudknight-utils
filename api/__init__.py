import importlib
import pkgutil

for module in pkgutil.iter_modules(__path__):
    # Skip common
    if module.name == "common":
        continue
    # Import all modules in dir
    importlib.import_module(f"{__name__}.{module.name}")
