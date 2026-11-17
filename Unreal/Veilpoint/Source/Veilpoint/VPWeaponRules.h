#pragma once
namespace VPWeaponRules
{
constexpr int Capacity=30;
constexpr float ReloadSeconds=2.6f; // Prototype tuning, not a weapon specification.
constexpr bool Coherent(int Total,int Magazine){return Total>=0 && Total<=60 && Magazine>=0 && Magazine<=Capacity && Magazine<=Total;}
constexpr bool CanShoot(bool Combat,bool Authority,bool Alive,bool Reloading,int Total,int Magazine)
{
    return Combat && Authority && Alive && !Reloading && Coherent(Total,Magazine) && Magazine>0;
}
constexpr bool CanReload(bool Combat,bool Authority,bool Alive,bool Reloading,int Total,int Magazine)
{
    return Combat && Authority && Alive && !Reloading && Coherent(Total,Magazine) && Magazine<Capacity && Total>Magazine;
}
constexpr int FilledMagazine(int Total,int Magazine)
{
    return Coherent(Total,Magazine)?(Total<Capacity?Total:Capacity):Magazine;
}
}
