# hooks/hook-dns.py - Enhanced PyInstaller hook for dnspython

from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# Collect all dns submodules
hiddenimports = collect_submodules('dns')

# Collect dns data files
datas = collect_data_files('dns')

# Add specific DNS modules that are critical for eventlet
hiddenimports += [
    'dns.resolver',
    'dns.rdatatype',
    'dns.rdataclass',
    'dns.query',
    'dns.message',
    'dns.name',
    'dns.rdata',
    'dns.rrset',
    'dns.zone',
    'dns.exception',
    'dns.flags',
    'dns.opcode',
    'dns.rcode',
    'dns.reversename',
    'dns.tsig',
    'dns.update',
    'dns.version',
    'dns.inet',
    'dns.ipv4',
    'dns.ipv6'
]