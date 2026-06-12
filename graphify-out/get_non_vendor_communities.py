import json
from pathlib import Path

analysis = json.loads(Path('graphify-out/.graphify_analysis.json').read_text(encoding="utf-8-sig"))
communities = analysis['communities']

# Let's group communities and print summaries of their nodes
for cid, nodes in communities.items():
    non_vendor_nodes = [n for n in nodes if not n.startswith('vendor_')]
    if non_vendor_nodes or len(nodes) < 10:
        print(f"Community {cid} (size {len(nodes)}):")
        print(f"  Non-vendor nodes: {non_vendor_nodes}")
        print(f"  Sample nodes: {nodes[:5]}")
