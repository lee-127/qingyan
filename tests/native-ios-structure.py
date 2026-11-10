from pathlib import Path
import json, plistlib, yaml
root = Path(__file__).resolve().parents[1]
with (root / "ios/project.yml").open(encoding="utf-8") as source:
    project = yaml.load(source, Loader=yaml.BaseLoader)
assert project["settings"]["base"]["TARGETED_DEVICE_FAMILY"] == "1,2"
assert project["targets"]["Qingyan"]["settings"]["base"]["PRODUCT_MODULE_NAME"] == "Qingyan"
with (root / "ios/QingyanApp/Info.plist").open("rb") as source:
    info = plistlib.load(source)
assert info["CFBundleDisplayName"] == "清研"
assert len(info["UISupportedInterfaceOrientations~ipad"]) == 4
with (root / "ios/workflows/build-private-ipa.yml").open(encoding="utf-8") as source:
    workflow = yaml.load(source, Loader=yaml.BaseLoader)
assert set(workflow["on"]) == {"workflow_dispatch"}
assert workflow["permissions"] == {"contents": "read"}
assert "github.event.repository.private" in workflow["jobs"]["build"]["if"]
assert workflow["on"]["workflow_dispatch"]["inputs"]["confirm_quota"]["default"] == "false"
assert any("xcodebuild build" in step.get("run", "") for step in workflow["jobs"]["build"]["steps"])
from PIL import Image
icon = Image.open(root / "ios/QingyanApp/Assets.xcassets/AppIcon.appiconset/AppIcon.png")
assert icon.size == (1024,1024) and icon.mode == "RGB"
print(json.dumps({"project_and_workflow_valid": True, "universal_iPhone_iPad": True, "icon_valid": True, "apple_sdk_compiled": False}))
