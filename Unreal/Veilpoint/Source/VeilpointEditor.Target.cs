using UnrealBuildTool;
using System.Collections.Generic;
public class VeilpointEditorTarget : TargetRules
{
    public VeilpointEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V6;
        ExtraModuleNames.Add("Veilpoint");
    }
}
