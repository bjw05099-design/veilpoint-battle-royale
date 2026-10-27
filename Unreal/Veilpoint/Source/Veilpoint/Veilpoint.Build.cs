using UnrealBuildTool;
public class Veilpoint : ModuleRules
{
    public Veilpoint(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new string[] {"Core", "CoreUObject", "Engine", "InputCore"});
        PrivateDependencyModuleNames.AddRange(new string[] {"EnhancedInput", "RenderCore"});
        bUseUnity = true;
    }
}
