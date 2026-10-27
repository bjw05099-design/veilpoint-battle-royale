using UnrealBuildTool;
using System.Collections.Generic;
public class VeilpointTarget : TargetRules
{
    public VeilpointTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V6;
        ExtraModuleNames.Add("Veilpoint");
    }
}
