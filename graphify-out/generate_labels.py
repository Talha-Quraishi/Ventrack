import json
from pathlib import Path

analysis = json.loads(Path('graphify-out/.graphify_analysis.json').read_text(encoding="utf-8-sig"))
communities = analysis['communities']

labels = {}
for cid, nodes in communities.items():
    cid_int = int(cid)
    # Manual labels
    if cid_int == 32:
        labels[cid_int] = "Electron Project Packaging Configuration"
    elif cid_int == 56:
        labels[cid_int] = "Electron Main Process and Backups"
    elif cid_int == 77:
        labels[cid_int] = "Ventrack Brand Identity Composition"
    elif cid_int == 82:
        labels[cid_int] = "Electron IPC Preload Bridge"
    elif cid_int == 83:
        labels[cid_int] = "Agent Rules and Workflows"
    elif cid_int == 85:
        labels[cid_int] = "UI Theme Accent Styling"
    elif cid_int == 86:
        labels[cid_int] = "UI Native Initialization"
    else:
        # Auto label based on contents
        has_tailwind = any('tailwind' in n.lower() for n in nodes)
        has_chart = any('chart' in n.lower() for n in nodes)
        has_jspdf = any('jspdf' in n.lower() for n in nodes)
        has_xlsx = any('xlsx' in n.lower() for n in nodes)
        has_lucide = any('lucide' in n.lower() for n in nodes)
        
        if has_tailwind:
            labels[cid_int] = f"Tailwind CSS Engine ({cid})"
        elif has_chart:
            labels[cid_int] = f"Chart.js Library ({cid})"
        elif has_jspdf:
            labels[cid_int] = f"jsPDF Document Library ({cid})"
        elif has_xlsx:
            labels[cid_int] = f"XLSX SheetJS Library ({cid})"
        elif has_lucide:
            labels[cid_int] = f"Lucide Icons Library ({cid})"
        else:
            labels[cid_int] = f"Vendor Library ({cid})"

# Update report
from graphify.build import build_from_json
from graphify.cluster import score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate

extraction = json.loads(Path('graphify-out/.graphify_extract.json').read_text(encoding="utf-8-sig"))
detection  = json.loads(Path('graphify-out/.graphify_detect.json').read_text(encoding="utf-8-sig"))

G = build_from_json(extraction)
comm_ints = {int(k): v for k, v in communities.items()}
cohesion = {int(k): v for k, v in analysis['cohesion'].items()}
tokens = {'input': extraction.get('input_tokens', 0), 'output': extraction.get('output_tokens', 0)}

questions = suggest_questions(G, comm_ints, labels)
report = generate(G, comm_ints, cohesion, labels, analysis['gods'], analysis['surprises'], detection, tokens, '.', suggested_questions=questions)

Path('graphify-out/GRAPH_REPORT.md').write_text(report, encoding="utf-8")
Path('graphify-out/.graphify_labels.json').write_text(json.dumps({str(k): v for k, v in labels.items()}, ensure_ascii=False), encoding="utf-8")
print('Report updated with community labels')
