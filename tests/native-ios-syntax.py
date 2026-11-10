from pathlib import Path
import sys, json
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "outputs/swift-syntax-runtime"))
from tree_sitter import Language, Parser
import tree_sitter_swift
parser = Parser(Language(tree_sitter_swift.language()))
files = list((root / "ios").rglob("*.swift"))
errors = []
def inspect(node, name):
    if node.type == "ERROR" or node.is_missing:
        errors.append({"file": name, "line": node.start_point.row + 1, "kind": node.type})
    for child in node.children:
        inspect(child, name)
for source in files:
    tree = parser.parse(source.read_bytes())
    if tree.root_node.has_error:
        inspect(tree.root_node, source.relative_to(root).as_posix())
print(json.dumps({"swift_sources": len(files), "syntax_errors": errors, "apple_sdk_typecheck": False}))
if errors:
    raise SystemExit(1)
