# check_imports.py
from PyInstaller.utils.hooks import collect_submodules

print("--- Submodules for 'dns' ---")
dns_modules = collect_submodules('dns')
for module in sorted(dns_modules): # Sorting makes the list easier to read
    print(module)

print("\n--- Submodules for 'eventlet' ---")
eventlet_modules = collect_submodules('eventlet')
for module in sorted(eventlet_modules):
    print(module)