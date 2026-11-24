#pragma once

namespace VPAdenRoads
{
enum class EHighway : unsigned char
{
    None, Primary, PrimaryLink, Tertiary, TertiaryLink, Residential, LivingStreet, Unclassified
};

enum class EGroup : unsigned char { Footprint, Local, Connector, Arterial };

constexpr EGroup Group(EHighway Highway)
{
    switch (Highway)
    {
    case EHighway::Primary: case EHighway::PrimaryLink: return EGroup::Arterial;
    case EHighway::Tertiary: case EHighway::TertiaryLink: return EGroup::Connector;
    case EHighway::Residential: case EHighway::LivingStreet: case EHighway::Unclassified: return EGroup::Local;
    default: return EGroup::Footprint;
    }
}

struct FStroke { float Red, Green, Blue, CanvasWidth; };

constexpr FStroke Stroke(EGroup Kind)
{
    switch (Kind)
    {
    case EGroup::Arterial: return {.95f, .76f, .40f, 2.7f};
    case EGroup::Connector: return {.77f, .69f, .49f, 2.1f};
    case EGroup::Local: return {.58f, .60f, .52f, 1.5f};
    default: return {.17f, .23f, .21f, 1.4f};
    }
}
}
