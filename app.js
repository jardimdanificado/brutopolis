// =============================================================================
// Brutopolis — Pure Canvas Simulation Engine (Embedded 8x8 Engine Font)
// =============================================================================

import { wash_memory, wash_load, wash_write_string } from "./wash.js";
import { World } from "./js/world.js";
import {
  createEntity,
  tickEntities,
  syncRenderToWasm,
  entityRegistry,
  getEntityById,
  destroyEntity,
  explodeEntityOnDeath,
  currentTick,
  resetEngineTicks,
  incrementEngineTick
} from "./js/engine.js";
import {
  resetWorldEvents,
  getEventsForEntity,
  getEventsForGroup,
  getRecentWorldEvents,
  getEventById,
  getCitationsForEvent,
  exportWorldChronicleJSON,
  downloadChronicleJSON,
  allEvents
} from "./js/event_log.js";
import {
  createLifeProp,
  createTerrestrialProp,
  createAquaticProp,
  createFlyingProp,
  createStomachProp,
  createBladderProp,
  createKidneyProp,
  createBrainProp,
  createWingsProp,
  createPawProp,
  createDeepRootProp,
  createSurfaceRootProp,
  createTerrainPreferenceProp,
  createParasitesProp,
  createBodyRegenerationProp,
  createCombatProp,
  createBurnProp,
  createViolentProp,
  createPacifistProp,
  createKnight,
  createArcher,
  createCat,
  createWolf,
  createBear,
  createGoblin,
  createBat,
  createSeaSerpent,
  createDragon,
  createCactus,
  createScorpion,
  createLizard,
  createAlpineShrub,
  createMountainGoat,
  createWoodItem,
  createStoneItem,
  createMouthProp,
  createCommunicationProp,
  createCrafterProp,
  createMinerProp,
  createBuilderProp,
  createGroup,
  createBruiseProp,
  createConcussionProp,
  createScarProp,
  createOakTree,
  createWillowTree,
  createPineTree,
  createWaterLily,
  createSeaweed,
  createFruit,
  createSeedEntity,
  createHumanMiner,
  createHumanBuilder,
  createHumanCrafter,
  createHumanFarmer,
  createHumanMatriarch,
  createHumanHunter,
  createHumanExplorer,
  createStoneWallEntity,
  createFarmerProp,
  createMysticGraceProp,
  createScatologicalProp,
  getMoodLabel,
  getGroupStockpile
} from "./js/properties.js";

// ---------------------------------------------------------------------------
// 1. Embedded 8x8 Bitmap Font (All 256 Characters: Exact Match with C/WASM Engine)
// ---------------------------------------------------------------------------

const FONT_8X8 = [
  [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00], // 0
  [0x00,0x3c,0x42,0xa5,0x81,0x99,0x42,0x3c], // 1
  [0x00,0x3c,0x7e,0xdb,0xff,0xc3,0x66,0x3c], // 2
  [0x00,0x66,0xff,0xff,0x7e,0x3c,0x18,0x00], // 3
  [0x00,0x18,0x3c,0x7e,0x7e,0x3c,0x18,0x00], // 4
  [0x00,0x18,0x3c,0x7e,0x18,0x7e,0x18,0x00], // 5
  [0x00,0x18,0x3c,0x7e,0xff,0x18,0x3c,0x00], // 6
  [0x00,0x00,0x18,0x3c,0x3c,0x18,0x00,0x00], // 7
  [0xff,0xff,0xe7,0xc3,0xc3,0xe7,0xff,0xff], // 8
  [0x00,0x3c,0x42,0x81,0x81,0x42,0x3c,0x00], // 9
  [0xff,0xc3,0xbd,0x7e,0x7e,0xbd,0xc3,0xff], // 10
  [0x0f,0x07,0x0b,0x59,0x9b,0x9b,0x59,0x00], // 11
  [0x00,0x3c,0x42,0x42,0x3c,0x18,0x7e,0x18], // 12
  [0x00,0x0c,0x0e,0x0c,0x0c,0x3c,0x7c,0x38], // 13
  [0x00,0x9c,0xbe,0xa6,0x64,0x6c,0xec,0xcc], // 14
  [0x00,0x24,0x66,0xe7,0x24,0xe7,0x66,0x24], // 15
  [0x00,0x30,0x38,0x3c,0x3e,0x3c,0x38,0x30], // 16
  [0x00,0x06,0x0e,0x1e,0x3e,0x1e,0x0e,0x06], // 17
  [0x00,0x18,0x3c,0x7e,0x18,0x7e,0x3c,0x18], // 18
  [0x00,0x66,0x66,0x66,0x66,0x00,0x66,0x00], // 19
  [0x00,0x7f,0xdb,0xdb,0x7b,0x1b,0x1b,0x1b], // 20
  [0x00,0x3e,0x63,0x38,0x0e,0x63,0x3e,0x00], // 21
  [0x00,0x00,0x00,0x7e,0x7e,0x00,0x00,0x00], // 22
  [0x00,0x18,0x3c,0x7e,0x18,0x18,0x7e,0x00], // 23
  [0x00,0x18,0x3c,0x7e,0x18,0x18,0x18,0x00], // 24
  [0x00,0x18,0x18,0x18,0x7e,0x3c,0x18,0x00], // 25
  [0x00,0x10,0x30,0x7e,0x30,0x10,0x00,0x00], // 26
  [0x00,0x08,0x0c,0x7e,0x0c,0x08,0x00,0x00], // 27
  [0x00,0x00,0x00,0x60,0x60,0x60,0x7e,0x00], // 28
  [0x00,0x00,0x24,0x66,0xff,0x66,0x24,0x00], // 29
  [0x00,0x18,0x3c,0x7e,0xff,0xff,0x00,0x00], // 30
  [0x00,0xff,0xff,0x7e,0x3c,0x18,0x00,0x00], // 31
  [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00], // 32
  [0x18,0x3c,0x3c,0x18,0x18,0x00,0x18,0x00], // 33
  [0x66,0x66,0x24,0x00,0x00,0x00,0x00,0x00], // 34
  [0x6c,0x6c,0xfe,0x6c,0xfe,0x6c,0x6c,0x00], // 35
  [0x18,0x3e,0x60,0x3c,0x06,0x7c,0x18,0x00], // 36
  [0x00,0x66,0xa6,0xd4,0x2b,0x65,0x66,0x00], // 37
  [0x38,0x6c,0x38,0x76,0xdc,0xcc,0x76,0x00], // 38
  [0x18,0x18,0x30,0x00,0x00,0x00,0x00,0x00], // 39
  [0x0c,0x18,0x30,0x30,0x30,0x18,0x0c,0x00], // 40
  [0x30,0x18,0x0c,0x0c,0x0c,0x18,0x30,0x00], // 41
  [0x00,0x66,0x3c,0xff,0x3c,0x66,0x00,0x00], // 42
  [0x00,0x18,0x18,0x7e,0x18,0x18,0x00,0x00], // 43
  [0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x30], // 44
  [0x00,0x00,0x00,0x7e,0x00,0x00,0x00,0x00], // 45
  [0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x00], // 46
  [0x06,0x0c,0x18,0x30,0x60,0xc0,0x80,0x00], // 47
  [0x3c,0x66,0x6e,0x76,0x66,0x66,0x3c,0x00], // 48
  [0x18,0x38,0x18,0x18,0x18,0x18,0x7e,0x00], // 49
  [0x3c,0x66,0x06,0x1c,0x30,0x60,0x7e,0x00], // 50
  [0x3c,0x66,0x06,0x1c,0x06,0x66,0x3c,0x00], // 51
  [0x0c,0x1c,0x34,0x64,0x7e,0x04,0x0e,0x00], // 52
  [0x7e,0x60,0x7c,0x06,0x06,0x66,0x3c,0x00], // 53
  [0x1c,0x30,0x60,0x7c,0x66,0x66,0x3c,0x00], // 54
  [0x7e,0xc6,0x0c,0x18,0x30,0x30,0x30,0x00], // 55
  [0x3c,0x66,0x66,0x3c,0x66,0x66,0x3c,0x00], // 56
  [0x3c,0x66,0x66,0x3e,0x06,0x0c,0x38,0x00], // 57
  [0x00,0x18,0x18,0x00,0x00,0x18,0x18,0x00], // 58
  [0x00,0x18,0x18,0x00,0x00,0x18,0x18,0x30], // 59
  [0x0c,0x18,0x30,0x60,0x30,0x18,0x0c,0x00], // 60
  [0x00,0x00,0x7e,0x00,0x7e,0x00,0x00,0x00], // 61
  [0x30,0x18,0x0c,0x06,0x0c,0x18,0x30,0x00], // 62
  [0x3c,0x66,0x06,0x0c,0x18,0x00,0x18,0x00], // 63
  [0x3c,0x66,0x6e,0x6e,0x60,0x62,0x3c,0x00], // 64
  [0x18,0x3c,0x66,0x7e,0x66,0x66,0x66,0x00], // 65
  [0x7c,0x66,0x66,0x7c,0x66,0x66,0x7c,0x00], // 66
  [0x3c,0x66,0x60,0x60,0x60,0x66,0x3c,0x00], // 67
  [0x78,0x6c,0x66,0x66,0x66,0x6c,0x78,0x00], // 68
  [0x7e,0x60,0x60,0x7c,0x60,0x60,0x7e,0x00], // 69
  [0x7e,0x60,0x60,0x7c,0x60,0x60,0x60,0x00], // 70
  [0x3c,0x66,0x60,0x6e,0x66,0x66,0x3a,0x00], // 71
  [0x66,0x66,0x66,0x7e,0x66,0x66,0x66,0x00], // 72
  [0x3c,0x18,0x18,0x18,0x18,0x18,0x3c,0x00], // 73
  [0x1e,0x0c,0x0c,0x0c,0x0c,0x6c,0x38,0x00], // 74
  [0x66,0x6c,0x78,0x70,0x78,0x6c,0x66,0x00], // 75
  [0x60,0x60,0x60,0x60,0x60,0x60,0x7e,0x00], // 76
  [0x63,0x77,0x7f,0x6b,0x63,0x63,0x63,0x00], // 77
  [0x66,0x76,0x7e,0x7e,0x6e,0x66,0x66,0x00], // 78
  [0x3c,0x66,0x66,0x66,0x66,0x66,0x3c,0x00], // 79
  [0x7c,0x66,0x66,0x7c,0x60,0x60,0x60,0x00], // 80
  [0x3c,0x66,0x66,0x66,0x6a,0x6c,0x36,0x00], // 81
  [0x7c,0x66,0x66,0x7c,0x6c,0x66,0x66,0x00], // 82
  [0x3c,0x66,0x60,0x3c,0x06,0x66,0x3c,0x00], // 83
  [0x7e,0x18,0x18,0x18,0x18,0x18,0x18,0x00], // 84
  [0x66,0x66,0x66,0x66,0x66,0x66,0x3c,0x00], // 85
  [0x66,0x66,0x66,0x66,0x66,0x3c,0x18,0x00], // 86
  [0x63,0x63,0x63,0x6b,0x7f,0x77,0x63,0x00], // 87
  [0x66,0x66,0x3c,0x18,0x3c,0x66,0x66,0x00], // 88
  [0x66,0x66,0x66,0x3c,0x18,0x18,0x18,0x00], // 89
  [0x7e,0x06,0x0c,0x18,0x30,0x60,0x7e,0x00], // 90
  [0x3c,0x30,0x30,0x30,0x30,0x30,0x3c,0x00], // 91
  [0xc0,0x60,0x30,0x18,0x0c,0x06,0x02,0x00], // 92
  [0x3c,0x0c,0x0c,0x0c,0x0c,0x0c,0x3c,0x00], // 93
  [0x18,0x3c,0x66,0x00,0x00,0x00,0x00,0x00], // 94
  [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xff], // 95
  [0x30,0x18,0x0c,0x00,0x00,0x00,0x00,0x00], // 96
  [0x00,0x00,0x3c,0x06,0x3e,0x66,0x3e,0x00], // 97
  [0x60,0x60,0x7c,0x66,0x66,0x66,0x7c,0x00], // 98
  [0x00,0x00,0x3c,0x66,0x60,0x66,0x3c,0x00], // 99
  [0x06,0x06,0x3e,0x66,0x66,0x66,0x3e,0x00], // 100
  [0x00,0x00,0x3c,0x66,0x7e,0x60,0x3c,0x00], // 101
  [0x1c,0x30,0x78,0x30,0x30,0x30,0x30,0x00], // 102
  [0x00,0x00,0x3e,0x66,0x66,0x3e,0x06,0x3c], // 103
  [0x60,0x60,0x7c,0x66,0x66,0x66,0x66,0x00], // 104
  [0x18,0x00,0x38,0x18,0x18,0x18,0x3c,0x00], // 105
  [0x0c,0x00,0x1c,0x0c,0x0c,0x0c,0x6c,0x38], // 106
  [0x60,0x60,0x66,0x6c,0x78,0x6c,0x66,0x00], // 107
  [0x38,0x18,0x18,0x18,0x18,0x18,0x3c,0x00], // 108
  [0x00,0x00,0x66,0x7f,0x7f,0x6b,0x63,0x00], // 109
  [0x00,0x00,0x7c,0x66,0x66,0x66,0x66,0x00], // 110
  [0x00,0x00,0x3c,0x66,0x66,0x66,0x3c,0x00], // 111
  [0x00,0x00,0x7c,0x66,0x66,0x7c,0x60,0x60], // 112
  [0x00,0x00,0x3e,0x66,0x66,0x3e,0x06,0x07], // 113
  [0x00,0x00,0x7c,0x66,0x60,0x60,0x60,0x00], // 114
  [0x00,0x00,0x3e,0x60,0x3c,0x06,0x7c,0x00], // 115
  [0x18,0x18,0x7e,0x18,0x18,0x18,0x0c,0x00], // 116
  [0x00,0x00,0x66,0x66,0x66,0x66,0x3e,0x00], // 117
  [0x00,0x00,0x66,0x66,0x66,0x3c,0x18,0x00], // 118
  [0x00,0x00,0x63,0x6b,0x7f,0x3e,0x36,0x00], // 119
  [0x00,0x00,0x66,0x3c,0x18,0x3c,0x66,0x00], // 120
  [0x00,0x00,0x66,0x66,0x66,0x3e,0x06,0x3c], // 121
  [0x00,0x00,0x7e,0x0c,0x18,0x30,0x7e,0x00], // 122
  [0x0e,0x18,0x18,0x70,0x18,0x18,0x0e,0x00], // 123
  [0x18,0x18,0x18,0x00,0x18,0x18,0x18,0x00], // 124
  [0x70,0x18,0x18,0x0e,0x18,0x18,0x70,0x00], // 125
  [0x76,0xdc,0x00,0x00,0x00,0x00,0x00,0x00], // 126
  [0x00,0x10,0x38,0x7c,0xfe,0x7c,0x38,0x10], // 127
  [0x00,0x3c,0x66,0x60,0x60,0x66,0x3c,0x0c], // 128
  [0x00,0x66,0x00,0x66,0x66,0x66,0x3e,0x00], // 129
  [0x00,0x0c,0x18,0x3c,0x66,0x7e,0x60,0x3c], // 130
  [0x00,0x18,0x24,0x3c,0x06,0x3e,0x66,0x3e], // 131
  [0x00,0x66,0x00,0x3c,0x06,0x3e,0x66,0x3e], // 132
  [0x00,0x30,0x18,0x3c,0x06,0x3e,0x66,0x3e], // 133
  [0x00,0x18,0x00,0x3c,0x06,0x3e,0x66,0x3e], // 134
  [0x00,0x00,0x3c,0x66,0x60,0x66,0x3c,0x0c], // 135
  [0x00,0x18,0x24,0x3c,0x66,0x7e,0x60,0x3c], // 136
  [0x00,0x66,0x00,0x3c,0x66,0x7e,0x60,0x3c], // 137
  [0x00,0x30,0x18,0x3c,0x66,0x7e,0x60,0x3c], // 138
  [0x00,0x66,0x00,0x18,0x18,0x18,0x3c,0x00], // 139
  [0x00,0x18,0x24,0x18,0x18,0x18,0x3c,0x00], // 140
  [0x00,0x30,0x18,0x18,0x18,0x18,0x3c,0x00], // 141
  [0x00,0x66,0x00,0x3c,0x66,0x7e,0x66,0x66], // 142
  [0x00,0x18,0x00,0x3c,0x66,0x7e,0x66,0x66], // 143
  [0x00,0x0c,0x18,0x7e,0x60,0x7c,0x60,0x7e], // 144
  [0x00,0x00,0x3b,0x46,0x7e,0x40,0x3b,0x00], // 145
  [0x00,0x7e,0x48,0x78,0x48,0x48,0x7e,0x00], // 146
  [0x00,0x18,0x24,0x3c,0x66,0x66,0x66,0x3c], // 147
  [0x00,0x66,0x00,0x3c,0x66,0x66,0x66,0x3c], // 148
  [0x00,0x30,0x18,0x3c,0x66,0x66,0x66,0x3c], // 149
  [0x00,0x18,0x24,0x66,0x66,0x66,0x66,0x3c], // 150
  [0x00,0x30,0x18,0x66,0x66,0x66,0x66,0x3c], // 151
  [0x00,0x66,0x00,0x66,0x66,0x3e,0x06,0x3c], // 152
  [0x00,0x66,0x00,0x3c,0x66,0x66,0x66,0x3c], // 153
  [0x00,0x66,0x00,0x66,0x66,0x66,0x66,0x3c], // 154
  [0x00,0x18,0x3e,0x60,0x60,0x3e,0x18,0x00], // 155
  [0x00,0x3c,0x66,0x60,0x7c,0x60,0x7e,0x00], // 156
  [0x00,0x66,0x66,0x3c,0x18,0x7e,0x18,0x00], // 157
  [0x00,0x7c,0x66,0x7c,0x60,0x7c,0x60,0x60], // 158
  [0x00,0x1c,0x30,0x78,0x30,0x30,0x30,0x00], // 159
  [0x00,0x0c,0x18,0x3c,0x06,0x3e,0x66,0x3e], // 160
  [0x00,0x0c,0x18,0x18,0x18,0x18,0x3c,0x00], // 161
  [0x00,0x0c,0x18,0x3c,0x66,0x66,0x66,0x3c], // 162
  [0x00,0x0c,0x18,0x66,0x66,0x66,0x66,0x3c], // 163
  [0x00,0x76,0xdc,0x7c,0x66,0x66,0x66,0x00], // 164
  [0x00,0x76,0xdc,0x66,0x76,0x7e,0x6e,0x66], // 165
  [0x00,0x3c,0x66,0x3c,0x00,0x7e,0x00,0x00], // 166
  [0x00,0x38,0x6c,0x38,0x00,0x7c,0x00,0x00], // 167
  [0x00,0x18,0x00,0x18,0x30,0x60,0x66,0x3c], // 168
  [0x00,0x00,0x7e,0x06,0x06,0x06,0x00,0x00], // 169
  [0x00,0x00,0x7e,0x60,0x60,0x60,0x00,0x00], // 170
  [0x00,0x60,0x60,0x6e,0x73,0x36,0x6c,0x7e], // 171
  [0x00,0x60,0x60,0x6d,0x75,0x37,0x05,0x07], // 172
  [0x00,0x18,0x00,0x18,0x18,0x3c,0x3c,0x18], // 173
  [0x00,0x36,0x6c,0xd8,0x6c,0x36,0x00,0x00], // 174
  [0x00,0xd8,0x6c,0x36,0x6c,0xd8,0x00,0x00], // 175
  [0x11,0x44,0x11,0x44,0x11,0x44,0x11,0x44], // 176
  [0x55,0xaa,0x55,0xaa,0x55,0xaa,0x55,0xaa], // 177
  [0xdd,0x77,0xdd,0x77,0xdd,0x77,0xdd,0x77], // 178
  [0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x18], // 179
  [0x18,0x18,0x18,0xf8,0x18,0x18,0x18,0x18], // 180
  [0x00,0x0c,0x18,0x3c,0x66,0x7e,0x66,0x66], // 181
  [0x00,0x18,0x24,0x3c,0x66,0x7e,0x66,0x66], // 182
  [0x00,0x30,0x18,0x3c,0x66,0x7e,0x66,0x66], // 183
  [0x00,0x00,0x00,0xf8,0x18,0x18,0x18,0x18], // 184
  [0x36,0x36,0x36,0xfe,0x36,0x36,0x36,0x36], // 185
  [0x36,0x36,0x36,0x36,0x36,0x36,0x36,0x36], // 186
  [0x00,0x00,0x00,0xfe,0x36,0x36,0x36,0x36], // 187
  [0x36,0x36,0x36,0xfe,0x00,0x00,0x00,0x00], // 188
  [0x36,0x36,0x36,0xf8,0x00,0x00,0x00,0x00], // 189
  [0x18,0x18,0x18,0xfe,0x00,0x00,0x00,0x00], // 190
  [0x00,0x00,0x00,0xf8,0x18,0x18,0x18,0x18], // 191
  [0x18,0x18,0x18,0x1f,0x00,0x00,0x00,0x00], // 192
  [0x18,0x18,0x18,0xff,0x00,0x00,0x00,0x00], // 193
  [0x00,0x00,0x00,0xff,0x18,0x18,0x18,0x18], // 194
  [0x18,0x18,0x18,0x1f,0x18,0x18,0x18,0x18], // 195
  [0x00,0x00,0x00,0xff,0x00,0x00,0x00,0x00], // 196
  [0x18,0x18,0x18,0xff,0x18,0x18,0x18,0x18], // 197
  [0x00,0x76,0xdc,0x3c,0x06,0x3e,0x66,0x3e], // 198
  [0x00,0x76,0xdc,0x3c,0x66,0x7e,0x66,0x66], // 199
  [0x36,0x36,0x36,0x7f,0x00,0x00,0x00,0x00], // 200
  [0x00,0x00,0x00,0x7f,0x36,0x36,0x36,0x36], // 201
  [0x36,0x36,0x36,0xff,0x00,0x00,0x00,0x00], // 202
  [0x00,0x00,0x00,0xff,0x36,0x36,0x36,0x36], // 203
  [0x36,0x36,0x36,0x7f,0x36,0x36,0x36,0x36], // 204
  [0x00,0x00,0xff,0x00,0xff,0x00,0x00,0x00], // 205
  [0x36,0x36,0x36,0xff,0x36,0x36,0x36,0x36], // 206
  [0x18,0x18,0x18,0xff,0x00,0x00,0x00,0x00], // 207
  [0x36,0x36,0x36,0xff,0x00,0x00,0x00,0x00], // 208
  [0x00,0x00,0x00,0xff,0x18,0x18,0x18,0x18], // 209
  [0x00,0x18,0x24,0x7e,0x60,0x7c,0x60,0x7e], // 210
  [0x00,0x66,0x00,0x7e,0x60,0x7c,0x60,0x7e], // 211
  [0x00,0x30,0x18,0x7e,0x60,0x7c,0x60,0x7e], // 212
  [0x00,0x00,0x00,0x1f,0x18,0x18,0x18,0x18], // 213
  [0x00,0x0c,0x18,0x3c,0x18,0x18,0x18,0x3c], // 214
  [0x00,0x18,0x24,0x3c,0x18,0x18,0x18,0x3c], // 215
  [0x00,0x66,0x00,0x3c,0x18,0x18,0x18,0x3c], // 216
  [0x18,0x18,0x18,0xf8,0x00,0x00,0x00,0x00], // 217
  [0x00,0x00,0x00,0x1f,0x18,0x18,0x18,0x18], // 218
  [0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff], // 219
  [0x00,0x00,0x00,0x00,0xff,0xff,0xff,0xff], // 220
  [0xf0,0xf0,0xf0,0xf0,0xf0,0xf0,0xf0,0xf0], // 221
  [0x0f,0x0f,0x0f,0x0f,0x0f,0x0f,0x0f,0x0f], // 222
  [0xff,0xff,0xff,0xff,0x00,0x00,0x00,0x00], // 223
  [0x00,0x0c,0x18,0x3c,0x66,0x66,0x66,0x3c], // 224
  [0x00,0x3c,0x66,0x7c,0x66,0x66,0x7c,0x60], // 225
  [0x00,0x18,0x24,0x3c,0x66,0x66,0x66,0x3c], // 226
  [0x00,0x30,0x18,0x3c,0x66,0x66,0x66,0x3c], // 227
  [0x00,0x76,0xdc,0x3c,0x66,0x66,0x66,0x3c], // 228
  [0x00,0x76,0xdc,0x3c,0x66,0x66,0x66,0x3c], // 229
  [0x00,0x00,0x66,0x66,0x66,0x7e,0x60,0x60], // 230
  [0x00,0x60,0x60,0x7c,0x66,0x66,0x7c,0x60], // 231
  [0x00,0x7c,0x66,0x7c,0x66,0x66,0x7c,0x60], // 232
  [0x00,0x0c,0x18,0x66,0x66,0x66,0x66,0x3c], // 233
  [0x00,0x18,0x24,0x66,0x66,0x66,0x66,0x3c], // 234
  [0x00,0x30,0x18,0x66,0x66,0x66,0x66,0x3c], // 235
  [0x00,0x0c,0x18,0x66,0x66,0x3e,0x06,0x3c], // 236
  [0x00,0x0c,0x18,0x66,0x66,0x3c,0x18,0x18], // 237
  [0x00,0xfe,0x00,0x00,0x00,0x00,0x00,0x00], // 238
  [0x00,0x0c,0x18,0x00,0x00,0x00,0x00,0x00], // 239
  [0x00,0x00,0x7e,0x00,0x7e,0x00,0x7e,0x00], // 240
  [0x00,0x18,0x18,0x7e,0x18,0x18,0x00,0x7e], // 241
  [0x00,0x00,0x00,0x00,0x00,0x7e,0x00,0x7e], // 242
  [0x00,0x60,0x60,0x6d,0x75,0x37,0x05,0x07], // 243
  [0x00,0x7f,0xdb,0xdb,0x7b,0x1b,0x1b,0x1b], // 244
  [0x00,0x3e,0x63,0x38,0x0e,0x63,0x3e,0x00], // 245
  [0x00,0x18,0x00,0x7e,0x00,0x18,0x00,0x00], // 246
  [0x00,0x00,0x00,0x00,0x00,0x00,0x18,0x0c], // 247
  [0x00,0x38,0x6c,0x38,0x00,0x00,0x00,0x00], // 248
  [0x00,0x66,0x00,0x00,0x00,0x00,0x00,0x00], // 249
  [0x00,0x00,0x00,0x18,0x18,0x00,0x00,0x00], // 250
  [0x00,0x18,0x38,0x18,0x18,0x7e,0x00,0x00], // 251
  [0x00,0x38,0x08,0x18,0x08,0x38,0x00,0x00], // 252
  [0x00,0x38,0x64,0x08,0x10,0x3c,0x00,0x00], // 253
  [0x00,0x00,0x3c,0x3c,0x3c,0x3c,0x00,0x00], // 254
  [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00] // 255
];

/**
 * Maps Unicode code points to 0..255 glyph index in FONT_8X8.
 */
function mapUnicodeToGlyphIndex(codePoint) {
  if (codePoint < 128) return codePoint;

  switch (codePoint) {
    // Portuguese / Latin accented letters
    case 0x00C7: return 128; // Ç
    case 0x00FC: return 129; // ü
    case 0x00E9: return 130; // é
    case 0x00E2: return 131; // â
    case 0x00E4: return 132; // ä
    case 0x00E0: return 133; // à
    case 0x00E5: return 134; // å
    case 0x00E7: return 135; // ç
    case 0x00EA: return 136; // ê
    case 0x00EB: return 137; // ë
    case 0x00E8: return 138; // è
    case 0x00EF: return 139; // ï
    case 0x00EE: return 140; // î
    case 0x00EC: return 141; // ì
    case 0x00C4: return 142; // Ä
    case 0x00C5: return 143; // Å
    case 0x00C9: return 144; // É
    case 0x00E6: return 145; // æ
    case 0x00C6: return 146; // Æ
    case 0x00F4: return 147; // ô
    case 0x00F6: return 148; // ö
    case 0x00F2: return 149; // ò
    case 0x00FB: return 150; // û
    case 0x00F9: return 151; // ù
    case 0x00FF: return 152; // ÿ
    case 0x00D6: return 153; // Ö
    case 0x00DC: return 154; // Ü
    case 0x00A2: return 155; // ¢
    case 0x00A3: return 156; // £
    case 0x00A5: return 157; // ¥
    case 0x20A7: return 158; // ₧
    case 0x0192: return 159; // ƒ
    case 0x00E1: return 160; // á
    case 0x00ED: return 161; // í
    case 0x00F3: return 162; // ó
    case 0x00FA: return 163; // ú
    case 0x00F1: return 164; // ñ
    case 0x00D1: return 165; // Ñ
    case 0x00AA: return 166; // ª
    case 0x00BA: return 167; // º
    case 0x00BF: return 168; // ¿
    case 0x2310: return 169; // ⌐
    case 0x00AC: return 170; // ¬
    case 0x00BD: return 171; // ½
    case 0x00BC: return 172; // ¼
    case 0x00A1: return 173; // ¡
    case 0x00AB: return 174; // «
    case 0x00BB: return 175; // »
    case 0x2591: return 176; // ░
    case 0x2592: return 177; // ▒
    case 0x2593: return 178; // ▓
    case 0x2502: return 179; // │
    case 0x2524: return 180; // ┤
    case 0x00C1: return 181; // Á
    case 0x00C2: return 182; // Â
    case 0x00C0: return 183; // À
    case 0x2563: return 185; // ╣
    case 0x2551: return 186; // ║
    case 0x2557: return 187; // ╗
    case 0x255D: return 188; // ╝
    case 0x2510: return 191; // ┐
    case 0x2514: return 192; // └
    case 0x2534: return 193; // ┴
    case 0x252C: return 194; // ┬
    case 0x251C: return 195; // ├
    case 0x2500: return 196; // ─
    case 0x253C: return 197; // ┼
    case 0x00E3: return 198; // ã
    case 0x00C3: return 199; // Ã
    case 0x255A: return 200; // ╚
    case 0x2554: return 201; // ╔
    case 0x2569: return 202; // ╩
    case 0x2566: return 203; // ╦
    case 0x2560: return 204; // ╠
    case 0x2550: return 205; // ═
    case 0x256C: return 206; // ╬
    case 0x00CA: return 210; // Ê
    case 0x00CB: return 211; // Ë
    case 0x00C8: return 212; // È
    case 0x00CD: return 214; // Í
    case 0x00CE: return 215; // Î
    case 0x00CF: return 216; // Ï
    case 0x2518: return 217; // ┘
    case 0x250C: return 218; // ┌
    case 0x2588: return 219; // █
    case 0x2584: return 220; // ▄
    case 0x258C: return 221; // ▌
    case 0x2590: return 222; // ▐
    case 0x2580: return 223; // ▀
    case 0x00D3: return 224; // Ó
    case 0x00DF: return 225; // ß
    case 0x00D4: return 226; // Ô
    case 0x00D2: return 227; // Ò
    case 0x00F5: return 228; // õ
    case 0x00D5: return 229; // Õ
    case 0x00B5: return 230; // µ
    case 0x00FE: return 231; // þ
    case 0x00DE: return 232; // Þ
    case 0x00DA: return 233; // Ú
    case 0x00DB: return 234; // Û
    case 0x00D9: return 235; // Ù
    case 0x00FD: return 236; // ý
    case 0x00DD: return 237; // Ý
    case 0x00AF: return 238; // ¯
    case 0x00B4: return 239; // ´
    case 0x2261: return 240; // ≡
    case 0x00B1: return 241; // ±
    case 0x00BE: return 243; // ¾
    case 0x00B6: return 244; // ¶
    case 0x00A7: return 245; // §
    case 0x00F7: return 246; // ÷
    case 0x00B8: return 247; // ¸
    case 0x00B0: return 248; // °
    case 0x00A8: return 249; // ¨
    case 0x00B7: return 250; // ·
    case 0x00B9: return 251; // ¹
    case 0x00B3: return 252; // ³
    case 0x00B2: return 253; // ²
    case 0x25A0: return 254; // ■
    case 0x00A0: return 255; // NBSP

    // Graphical symbols
    case 0x263A: return 1;  // ☺
    case 0x263B: return 2;  // ☻
    case 0x2665: return 3;  // ♥
    case 0x2666: return 4;  // ♦
    case 0x2663: return 5;  // ♣
    case 0x2660: return 6;  // ♠
    case 0x2022: return 7;  // •
    case 0x25D8: return 8;  // ◘
    case 0x25CB: return 9;  // ○
    case 0x25D9: return 10; // ◙
    case 0x2642: return 11; // ♂
    case 0x2640: return 12; // ♀
    case 0x266A: return 13; // ♪
    case 0x266B: return 14; // ♫
    case 0x263C: return 15; // ☼
    case 0x25BA: case 0x25B6: case 0x25B8: return 16; // ►, ▶, ▸
    case 0x25C4: case 0x25C0: case 0x25C2: return 17; // ◄, ◀, ◂
    case 0x2195: return 18; // ↕
    case 0x203C: return 19; // ‼
    case 0x2191: return 24; // ↑
    case 0x2193: return 25; // ↓
    case 0x2192: return 26; // →
    case 0x2190: return 27; // ←
    case 0x2194: return 29; // ↔
    case 0x25B2: return 30; // ▲
    case 0x25BC: return 31; // ▼
    case 0x2302: return 127; // ⌂

    default:
      if (codePoint >= 0 && codePoint < 256) return codePoint;
      return 63; // '?'
  }
}

/**
 * Draws crisp text using the embedded 8x8 engine font directly to Canvas.
 */
function drawText8x8(text, startX, startY, color = "#ffffff", scale = 1) {
  if (text === undefined || text === null) return;
  const str = String(text);
  ctx.save();
  ctx.fillStyle = color;

  let cx = startX;
  let cy = startY;

  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\n") {
      cx = startX;
      cy += 9 * scale;
      continue;
    }

    const codePoint = str.codePointAt(i);
    if (codePoint > 0xffff) {
      i++; // Account for surrogate pairs in JS string
    }

    const charIdx = mapUnicodeToGlyphIndex(codePoint);
    const glyph = FONT_8X8[charIdx] || FONT_8X8[63];

    for (let r = 0; r < 8; r++) {
      const rowBits = glyph[r];
      for (let c = 0; c < 8; c++) {
        if (rowBits & (1 << (7 - c))) {
          ctx.fillRect(cx + c * scale, cy + r * scale, scale, scale);
        }
      }
    }
    cx += 8 * scale;
  }
  ctx.restore();
}

function wrapText8x8(text, maxCharsPerLine) {
  if (!text) return [];
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

// ---------------------------------------------------------------------------
// Canvas & Simulation Setup
// ---------------------------------------------------------------------------

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const FRAMEBUFFER_SIZE = CANVAS_WIDTH * CANVAS_HEIGHT * 4;

const mem = wash_memory(32 * 1024 * 1024);
const imageData = ctx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);

let shader = null;
let world = null;
let entities = [];

// Simulation Speed & Time State
let isPaused = false;
let simSpeed = 1.0; // 0.5x, 1x, 2x, 4x, 8x, 16x
const SPEED_TIERS = [0.5, 1.0, 2.0, 4.0, 8.0, 16.0];
let currentPreset = 0;
let lastSelectedId = -1;

// Performance
let lastTime = 0;
let fpsFrames = 0;
let currentFps = 60;
let lastFpsUpdate = performance.now();
let tpsCounter = 0;
let measuredTps = 60;
let lastTpsUpdate = performance.now();

// Active In-Game Screen Mode ("MAP", "INSPECT", "ENTITIES", "GROUPS", "LOGS")
let currentMode = "MAP";
let modalScroll = 0;
let inspectingLogEvent = null;
let inspectingGroup = null; // Currently inspected clan for full dossier/stockpile view
let groupDetailTab = "OVERVIEW"; // Active tab in clan dossier: "OVERVIEW" or "HISTORY"
let dossierTab = "OVERVIEW"; // Active tab in creature dossier: "OVERVIEW", "AFFINITIES", "OFFSPRING", "CHRONICLE"
let inspectingFromCreature = false;
let visualizedGroupId = null; // ID of clan whose claimed territory is being highlighted on map
let isFollowMode = false; // Camera automatically follows and locks onto selected creature
let isCreatureVisionMode = false; // "See through creature's eyes" perception FOV & Fog of War

// Real-Time Floating Corner Map Editor State
let isEditorOpen = false; // Floating corner editor menu visibility
let editorTab = "TILES"; // "TILES", "CREATURES", "ITEMS", "TOOLS"
let editorSelectedTile = 0; // 0: Grass, 1: Mountain, 2: Water, 3: Sand, 4: Stone, 5: Void
let editorBrushSize = 1; // 1, 3, 5
let editorTool = null; // null when closed; "PAINT", "SPAWN", "BULLDOZER", "EYEDROPPER"
let editorActiveSpawner = null; // { label, fn }
let isPainting = false;
let editorPage = 0; // Pagination for mob/item lists in compact bar

const EDITOR_TILES = [
  { id: 0, label: "GRASS / SOIL", color: "#58d854", desc: "Fertile land / forest" },
  { id: 1, label: "MOUNTAIN PEAK", color: "#f8f8f8", desc: "High rocky terrain" },
  { id: 2, label: "OCEAN WATER", color: "#0078f8", desc: "Deep / ocean water" },
  { id: 3, label: "DESERT SAND", color: "#f8b800", desc: "Arid desert dunes" },
  { id: 4, label: "FOOTHILLS", color: "#888888", desc: "Stone & mineral hills" },
  { id: 5, label: "VOID / ABYSS", color: "#222222", desc: "Impassable bedrock" }
];

const EDITOR_CREATURES = [
  { label: "KNIGHT", fn: (x, y) => createKnight(x, y) },
  { label: "ARCHER", fn: (x, y) => createArcher(x, y) },
  { label: "FARMER", fn: (x, y) => createHumanFarmer(x, y) },
  { label: "MINER", fn: (x, y) => createHumanMiner(x, y) },
  { label: "BUILDER", fn: (x, y) => createHumanBuilder(x, y) },
  { label: "MATRIARCH", fn: (x, y) => createHumanMatriarch(x, y) },
  { label: "ARTISAN", fn: (x, y) => createHumanCrafter(x, y) },
  { label: "HUNTER", fn: (x, y) => createHumanHunter(x, y) },
  { label: "EXPLORER", fn: (x, y) => createHumanExplorer(x, y) },
  { label: "WOLF", fn: (x, y) => createWolf(x, y) },
  { label: "BEAR", fn: (x, y) => createBear(x, y) },
  { label: "CAT", fn: (x, y) => createCat(x, y) },
  { label: "GOAT", fn: (x, y) => createMountainGoat(x, y) },
  { label: "BAT", fn: (x, y) => createBat(x, y) },
  { label: "GOBLIN", fn: (x, y) => createGoblin(x, y) },
  { label: "SCORPION", fn: (x, y) => createScorpion(x, y) },
  { label: "LIZARD", fn: (x, y) => createLizard(x, y) },
  { label: "DRAGON", fn: (x, y) => createDragon(x, y) },
  { label: "SERPENT", fn: (x, y) => createSeaSerpent(x, y) }
];

const EDITOR_ITEMS = [
  { label: "OAK TREE", fn: (x, y) => createOakTree(x, y) },
  { label: "PINE TREE", fn: (x, y) => createPineTree(x, y) },
  { label: "WILLOW", fn: (x, y) => createWillowTree(x, y) },
  { label: "CACTUS", fn: (x, y) => createCactus(x, y) },
  { label: "SHRUB", fn: (x, y) => createAlpineShrub(x, y) },
  { label: "WATER LILY", fn: (x, y) => createWaterLily(x, y) },
  { label: "SEAWEED", fn: (x, y) => createSeaweed(x, y) },
  { label: "WOOD ITEM", fn: (x, y) => createWoodItem(x, y) },
  { label: "STONE ITEM", fn: (x, y) => createStoneItem(x, y) },
  { label: "STONE WALL", fn: (x, y) => createStoneWallEntity(x, y) },
  { label: "OAK SEED", fn: (x, y) => createSeedEntity(x, y, "large", "oak") },
  { label: "FRUIT", fn: (x, y) => createFruit(x, y, "large", "oak") }
];

function applyTileBrush(cx, cy, tileType, brushSize) {
  if (!world) return;
  const half = Math.floor(brushSize / 2);
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const tx = cx + dx;
      const ty = cy + dy;
      if (tx >= 0 && tx < (world.width || 512) && ty >= 0 && ty < (world.height || 512)) {
        world.setTile(tx, ty, tileType);
      }
    }
  }
}

function applyEditorActionAt(tileX, tileY) {
  if (!world || tileX < 0 || tileX >= (world.width || 512) || tileY < 0 || tileY >= (world.height || 512)) return;

  if (editorTool === "PAINT") {
    applyTileBrush(tileX, tileY, editorSelectedTile, editorBrushSize);
  } else if (editorTool === "SPAWN" && editorActiveSpawner) {
    const ent = editorActiveSpawner.fn(tileX, tileY);
    entities.push(ent);
  } else if (editorTool === "BULLDOZER") {
    const targets = entities.filter(e => !e.destroyed && e.x === tileX && e.y === tileY);
    for (const t of targets) {
      destroyEntity(t, entities);
    }
  } else if (editorTool === "EYEDROPPER") {
    const sampled = world.getTile(tileX, tileY);
    editorSelectedTile = sampled;
    editorTool = "PAINT";
  }
}

function toggleFollowMode() {
  isFollowMode = !isFollowMode;
}

function toggleCreatureVisionMode() {
  isCreatureVisionMode = !isCreatureVisionMode;
}

function parseZoneCoords(zoneStr) {
  if (!zoneStr) return null;
  const parts = zoneStr.includes("_") ? zoneStr.split("_") : zoneStr.split(",");
  const zx = parseInt(parts[0], 10);
  const zy = parseInt(parts[1], 10);
  if (isNaN(zx) || isNaN(zy)) return null;
  return {
    zx,
    zy,
    minX: zx * 8,
    minY: zy * 8,
    maxX: zx * 8 + 7,
    maxY: zy * 8 + 7,
    centerX: zx * 8 + 4,
    centerY: zy * 8 + 4
  };
}

// Registry Filters & Selection
let entityFilter = "ALL";
let groupSelectedIdx = 0;
let logFilter = "ALL";

// Mouse & Input State
let mouseX = 0;
let mouseY = 0;
let mouseButtons = 0;
let isMouseDown = false;
let isDragging = false;
let dragStartClientX = 0;
let dragStartClientY = 0;
let dragCameraStartX = 0;
let dragCameraStartY = 0;

const keysDown = new Set();

// Clickable UI Regions
let activeUiRegions = [];

function registerClickableRegion(x, y, w, h, onClick, cursor = "pointer") {
  activeUiRegions.push({ x, y, w, h, onClick, cursor });
}

// ---------------------------------------------------------------------------
// Screen Resize & Aspect Ratio Fitting
// ---------------------------------------------------------------------------

function resizeCanvasToWindow() {
  const windowW = window.innerWidth;
  const windowH = window.innerHeight;
  const aspect = CANVAS_WIDTH / CANVAS_HEIGHT;

  let displayW, displayH;
  if (windowW / windowH > aspect) {
    displayH = windowH;
    displayW = displayH * aspect;
  } else {
    displayW = windowW;
    displayH = displayW / aspect;
  }

  canvas.style.width = `${Math.floor(displayW)}px`;
  canvas.style.height = `${Math.floor(displayH)}px`;
}

window.addEventListener("resize", resizeCanvasToWindow);
resizeCanvasToWindow();

function getCanvasCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;

  const cx = (clientX - rect.left) * scaleX;
  const cy = (clientY - rect.top) * scaleY;

  return {
    x: Math.max(0, Math.min(CANVAS_WIDTH, cx)),
    y: Math.max(0, Math.min(CANVAS_HEIGHT, cy)),
    inside: clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  };
}

// ---------------------------------------------------------------------------
// World Initialization
// ---------------------------------------------------------------------------

function spawnRandomGlobal(count, factoryFn, conditionFn = null) {
  let spawned = 0;
  for (let attempt = 0; attempt < count * 8 && spawned < count; attempt++) {
    const rx = Math.floor(Math.random() * 508) + 2;
    const ry = Math.floor(Math.random() * 508) + 2;
    if (!conditionFn || conditionFn(rx, ry)) {
      const e = factoryFn(rx, ry);
      entities.push(e);
      spawned++;
    }
  }
}

function resetWorld(presetId = 0) {
  if (!shader) return;
  currentPreset = presetId;
  const seed = Math.floor(Math.random() * 1000000) + 1;
  if (shader.exports.wasm_init_with_seed) {
    shader.exports.wasm_init_with_seed(presetId, seed);
  } else {
    shader.exports.wasm_init(presetId);
  }

  resetEngineTicks();
  resetWorldEvents();
  world.refresh();
  entities = [];
  lastSelectedId = -1;
  modalScroll = 0;
  inspectingLogEvent = null;

  // Flora
  spawnRandomGlobal(80, createOakTree, (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(60, createWillowTree, (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 3);
  spawnRandomGlobal(65, createCactus, (x, y) => world.getTile(x, y) === 3);
  spawnRandomGlobal(50, createAlpineShrub, (x, y) => world.getTile(x, y) === 4 || world.getTile(x, y) === 1);
  spawnRandomGlobal(55, createPineTree, (x, y) => world.getTile(x, y) === 4 || world.getTile(x, y) === 0);
  spawnRandomGlobal(80, createWaterLily, (x, y) => world.getTile(x, y) === 2);
  spawnRandomGlobal(100, createSeaweed, (x, y) => world.getTile(x, y) === 2);

  // Items & Resources
  spawnRandomGlobal(60, (x, y) => createSeedEntity(x, y, "large", "oak"), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(40, (x, y) => createSeedEntity(x, y, "small", "willow"), (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 3);
  spawnRandomGlobal(30, (x, y) => createFruit(x, y, "large", "cactus"), (x, y) => world.getTile(x, y) === 3);
  spawnRandomGlobal(40, (x, y) => createFruit(x, y, "large", "oak"), (x, y) => world.isWalkable(x, y));
  spawnRandomGlobal(50, createWoodItem, (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(50, createStoneItem, (x, y) => world.getTile(x, y) === 4 || world.getTile(x, y) === 1);

  // 1. Determine spawn position for Camera and Founding Clan
  let startX = 256;
  let startY = 256;
  for (let r = 0; r < 100; r++) {
    let found = false;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (world.isWalkable(256 + dx, 256 + dy)) {
          startX = 256 + dx;
          startY = 256 + dy;
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (found) break;
  }

  // Fauna (Dangerous predators spawn outside initial settlement buffer)
  const outsideSettlement = (x, y) => (Math.abs(x - startX) + Math.abs(y - startY)) > 28;
  spawnRandomGlobal(25, createScorpion, (x, y) => world.getTile(x, y) === 3);
  spawnRandomGlobal(20, createLizard, (x, y) => world.getTile(x, y) === 3 || world.getTile(x, y) === 0);
  spawnRandomGlobal(20, createMountainGoat, (x, y) => world.getTile(x, y) === 4 || world.getTile(x, y) === 1);
  spawnRandomGlobal(20, (x, y) => createCat(x, y, false), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(14, createWolf, (x, y) => (world.getTile(x, y) === 0 || world.getTile(x, y) === 4) && outsideSettlement(x, y));
  spawnRandomGlobal(8, createBear, (x, y) => world.getTile(x, y) === 0 && outsideSettlement(x, y));
  spawnRandomGlobal(25, createBat, (x, y) => true);
  spawnRandomGlobal(20, createSeaSerpent, (x, y) => world.getTile(x, y) === 2);
  spawnRandomGlobal(3, createDragon, (x, y) => (world.getTile(x, y) === 1 || world.getTile(x, y) === 4) && outsideSettlement(x, y));
  spawnRandomGlobal(18, (x, y) => createKnight(x, y, Math.random() < 0.5 ? "male" : "female"), (x, y) => world.getTile(x, y) === 0 && outsideSettlement(x, y));
  spawnRandomGlobal(18, (x, y) => createArcher(x, y, Math.random() < 0.5 ? "male" : "female"), (x, y) => world.getTile(x, y) === 0 && outsideSettlement(x, y));
  spawnRandomGlobal(20, createGoblin, (x, y) => (world.getTile(x, y) === 0 || world.getTile(x, y) === 4) && outsideSettlement(x, y));

  // 2. Founding Pioneers Clan: 2 Builders, 1 Farmer, 2 Matriarchs, 2 Explorers, 1 Miner, 2 Hunters
  const miner = createHumanMiner(startX, startY, "Aldor Silveira, the Miner");
  miner.properties.surname = "Silveira";
  const builder1 = createHumanBuilder(startX + 1, startY, "Brom Rocha, the Builder");
  builder1.properties.surname = "Rocha";
  const builder2 = createHumanBuilder(startX + 2, startY, "Torben Barros, the Builder");
  builder2.properties.surname = "Barros";
  const farmer = createHumanFarmer(startX - 1, startY, "Farid Prado, the Farmer");
  farmer.properties.surname = "Prado";
  const matriarch1 = createHumanMatriarch(startX + 1, startY + 1, "Elena Silveira, the Matriarch");
  matriarch1.properties.surname = "Silveira";
  const matriarch2 = createHumanMatriarch(startX - 1, startY + 1, "Maya Vance, the Matriarch");
  const crafter1 = createHumanCrafter(startX, startY + 2, "Lyra Montes, the Artisan");
  crafter1.properties.surname = "Montes";
  const crafter2 = createHumanCrafter(startX + 2, startY + 2, "Silas Ramos, the Artisan");
  crafter2.properties.surname = "Ramos";
  const hunter1 = createHumanHunter(startX, startY - 1, "Kael Torres, the Hunter");
  hunter1.properties.surname = "Torres";
  const hunter2 = createHumanHunter(startX + 1, startY - 1, "Rowan Valente, the Huntress");
  hunter2.properties.surname = "Valente";

  const zx = Math.floor(startX / 8);
  const zy = Math.floor(startY / 8);
  const zone1 = `${zx},${zy}`;
  const zone2 = `${zx + 1},${zy}`;

  const foundingClan = createGroup("Pioneers Clan", miner, [zx, zy], [zone1, zone2]);
  foundingClan.leaderId = miner.id;
  foundingClan.storage = ["stone", "stone", "stone", "stone", "wood", "wood", "wood", "wood", "meat", "meat"];

  const clanMembers = [miner, builder1, builder2, farmer, matriarch1, matriarch2, crafter1, crafter2, hunter1, hunter2];

  for (const m of clanMembers) {
    m.properties.group = foundingClan;
    if (m.properties.brain) {
      if (!m.properties.brain.affinities) m.properties.brain.affinities = {};
      for (const other of clanMembers) {
        if (m !== other) m.properties.brain.affinities[other.id] = 35; // Moderate starting affinity
      }
    }
  }

  foundingClan.members = clanMembers.map(m => m.id);
  entities.push(...clanMembers);

  // Initial clan resources placed right in territory center
  for (let i = 0; i < 6; i++) {
    entities.push(createWoodItem(startX + (i % 3), startY + Math.floor(i / 3)));
    entities.push(createStoneItem(startX - 1 + (i % 3), startY + Math.floor(i / 3)));
  }
  for (let i = 0; i < 4; i++) {
    entities.push(createSeedEntity(startX + 1 + (i % 2), startY + Math.floor(i / 2), "large", "oak"));
  }

  // Position camera and selection right on the founding clan!
  lastSelectedId = miner.id;
  shader.exports.wasm_select_entity(miner.id);
  shader.exports.wasm_set_camera(startX, startY, 2.0);
}

function spawnEntityAtCamera(factoryFn) {
  if (!shader) return;
  const cx = Math.floor(shader.exports.wasm_get_camera_x());
  const cy = Math.floor(shader.exports.wasm_get_camera_y());
  const ent = factoryFn(cx, cy);
  entities.push(ent);
  lastSelectedId = ent.id;
  shader.exports.wasm_select_entity(ent.id);
}

function cycleNextLivingEntity() {
  if (entities.length === 0 || !shader) return;
  const living = entities.filter(e => !e.destroyed && e.properties && e.properties.life);
  if (living.length === 0) return;

  const curIdx = living.findIndex(e => e.id === lastSelectedId);
  const nextIdx = (curIdx + 1) % living.length;
  const nextEnt = living[nextIdx];

  lastSelectedId = nextEnt.id;
  shader.exports.wasm_select_entity(nextEnt.id);
  shader.exports.wasm_set_camera(nextEnt.x, nextEnt.y, shader.exports.wasm_get_camera_zoom());
}

function centerCamera() {
  if (!shader) return;
  const sel = getEntityById(lastSelectedId);
  if (sel) {
    shader.exports.wasm_set_camera(sel.x, sel.y, shader.exports.wasm_get_camera_zoom());
  } else {
    shader.exports.wasm_set_camera(256, 256, 1.0);
  }
}

function togglePause() {
  if (!shader) return;
  isPaused = !isPaused;
  shader.exports.wasm_set_paused(isPaused ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Mouse & Keyboard Input Dispatcher
// ---------------------------------------------------------------------------

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
  const coords = getCanvasCoords(e.clientX, e.clientY);
  mouseX = coords.x;
  mouseY = coords.y;
  mouseButtons = e.buttons;

  isMouseDown = true;
  isDragging = false;
  dragStartClientX = e.clientX;
  dragStartClientY = e.clientY;

  if (shader) {
    dragCameraStartX = shader.exports.wasm_get_camera_x();
    dragCameraStartY = shader.exports.wasm_get_camera_y();
  }

  // Handle clickable UI regions first on left-click
  if (e.button === 0) {
    for (let i = activeUiRegions.length - 1; i >= 0; i--) {
      const reg = activeUiRegions[i];
      if (coords.x >= reg.x && coords.x <= reg.x + reg.w && coords.y >= reg.y && coords.y <= reg.y + reg.h) {
        reg.onClick();
        isMouseDown = false;
        return;
      }
    }

    // If Editor is active and clicked on map canvas (not over UI bars or corner menu)
    if (isEditorOpen && editorTool && shader && currentMode === "MAP" && coords.inside && coords.y > 32 && coords.y < CANVAS_HEIGHT - 36) {
      const zoom = shader.exports.wasm_get_camera_zoom();
      const tileSize = 16.0 * zoom;
      const cx = shader.exports.wasm_get_camera_x();
      const cy = shader.exports.wasm_get_camera_y();
      const tileX = Math.floor(cx + (coords.x - CANVAS_WIDTH / 2) / tileSize);
      const tileY = Math.floor(cy + (coords.y - CANVAS_HEIGHT / 2) / tileSize);

      isPainting = true;
      applyEditorActionAt(tileX, tileY);
      return;
    }
  }
});

window.addEventListener("mousemove", (e) => {
  const coords = getCanvasCoords(e.clientX, e.clientY);
  mouseX = coords.x;
  mouseY = coords.y;

  let isOverUi = false;
  for (const reg of activeUiRegions) {
    if (coords.x >= reg.x && coords.x <= reg.x + reg.w && coords.y >= reg.y && coords.y <= reg.y + reg.h) {
      canvas.style.cursor = reg.cursor || "pointer";
      isOverUi = true;
      break;
    }
  }
  if (!isOverUi) {
    canvas.style.cursor = (currentMode === "MAP" && isEditorOpen && editorTool) ? "crosshair" : "default";
  }

  // Active Real-Time Painting Drag
  if (isEditorOpen && isPainting && isMouseDown && shader && currentMode === "MAP" && (editorTool === "PAINT" || editorTool === "BULLDOZER")) {
    if (coords.inside && coords.y > 32 && coords.y < CANVAS_HEIGHT - 36) {
      const zoom = shader.exports.wasm_get_camera_zoom();
      const tileSize = 16.0 * zoom;
      const cx = shader.exports.wasm_get_camera_x();
      const cy = shader.exports.wasm_get_camera_y();
      const tileX = Math.floor(cx + (coords.x - CANVAS_WIDTH / 2) / tileSize);
      const tileY = Math.floor(cy + (coords.y - CANVAS_HEIGHT / 2) / tileSize);
      applyEditorActionAt(tileX, tileY);
      return;
    }
  }

  // Camera Drag (Right Click or Left Click Drag when not painting)
  if (isMouseDown && shader && !isPainting && currentMode === "MAP") {
    const totalDist = Math.hypot(e.clientX - dragStartClientX, e.clientY - dragStartClientY);
    if (totalDist > 4) {
      isDragging = true;
      const zoom = shader.exports.wasm_get_camera_zoom();
      const rect = canvas.getBoundingClientRect();
      const pixelScale = rect.width / CANVAS_WIDTH;
      const tileSizeScreen = 16.0 * zoom * pixelScale;

      if (tileSizeScreen > 0.2) {
        const dx = (e.clientX - dragStartClientX) / tileSizeScreen;
        const dy = (e.clientY - dragStartClientY) / tileSizeScreen;
        shader.exports.wasm_set_camera(dragCameraStartX - dx, dragCameraStartY - dy, zoom);
      }
    }
  }
});

window.addEventListener("mouseup", (e) => {
  if (isMouseDown && shader && currentMode === "MAP") {
    const totalDist = Math.hypot(e.clientX - dragStartClientX, e.clientY - dragStartClientY);
    if (!isDragging && !isPainting && totalDist <= 5) {
      const coords = getCanvasCoords(e.clientX, e.clientY);

      // Check if mouseup landed on any active UI region before selecting on map
      let isOverUi = false;
      for (let i = activeUiRegions.length - 1; i >= 0; i--) {
        const reg = activeUiRegions[i];
        if (coords.x >= reg.x && coords.x <= reg.x + reg.w && coords.y >= reg.y && coords.y <= reg.y + reg.h) {
          isOverUi = true;
          break;
        }
      }

      if (!isOverUi && coords.inside && coords.y > 32 && coords.y < CANVAS_HEIGHT - 36) {
        const foundId = shader.exports.wasm_select_at(coords.x, coords.y, CANVAS_WIDTH, CANVAS_HEIGHT);
        lastSelectedId = foundId;
      }
    }
  }
  isMouseDown = false;
  isDragging = false;
  isPainting = false;
  mouseButtons = 0;
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (currentMode !== "MAP") {
    if (e.deltaY < 0) modalScroll = Math.max(0, modalScroll - 2);
    else modalScroll += 2;
    return;
  }

  if (!shader) return;
  let zoom = shader.exports.wasm_get_camera_zoom();
  const cx = shader.exports.wasm_get_camera_x();
  const cy = shader.exports.wasm_get_camera_y();

  if (e.deltaY < 0) {
    zoom = Math.min(8.0, zoom * 1.15);
  } else {
    zoom = Math.max(0.15, zoom / 1.15);
  }

  shader.exports.wasm_set_camera(cx, cy, zoom);
}, { passive: false });

window.addEventListener("keydown", (e) => {
  keysDown.add(e.code);

  if (e.code === "Space") {
    e.preventDefault();
    togglePause();
  } else if (e.code === "KeyR") {
    resetWorld((currentPreset + 1) % 3);
  } else if (e.code === "KeyC") {
    centerCamera();
  } else if (e.code === "KeyK") {
    if (lastSelectedId > 0) {
      const ent = getEntityById(lastSelectedId);
      if (ent) {
        explodeEntityOnDeath(ent, entities, world);
        destroyEntity(ent, entities);
        cycleNextLivingEntity();
      }
    }
  } else if (e.code === "KeyF") {
    toggleFollowMode();
  } else if (e.code === "KeyV") {
    toggleCreatureVisionMode();
  } else if (e.code === "Tab") {
    e.preventDefault();
    cycleNextLivingEntity();
  } else if (e.code === "KeyI") {
    currentMode = currentMode === "INSPECT" ? "MAP" : "INSPECT";
    modalScroll = 0;
  } else if (e.code === "KeyE") {
    currentMode = currentMode === "ENTITIES" ? "MAP" : "ENTITIES";
    modalScroll = 0;
  } else if (e.code === "KeyG") {
    currentMode = currentMode === "GROUPS" ? "MAP" : "GROUPS";
    modalScroll = 0;
  } else if (e.code === "KeyL") {
    currentMode = currentMode === "LOGS" ? "MAP" : "LOGS";
    modalScroll = 0;
    inspectingLogEvent = null;
  } else if (e.code === "KeyS") {
    isEditorOpen = !isEditorOpen;
    if (isEditorOpen) {
      if (!editorTool) editorTool = "PAINT";
    } else {
      editorTool = null;
      editorActiveSpawner = null;
      isPainting = false;
    }
  } else if (e.code === "Escape") {
    if (isEditorOpen) {
      isEditorOpen = false;
      editorTool = null;
      editorActiveSpawner = null;
      isPainting = false;
    } else if (inspectingLogEvent) {
      inspectingLogEvent = null;
    } else if (inspectingGroup) {
      inspectingGroup = null;
    } else {
      currentMode = "MAP";
    }
  } else if (e.code === "Equal" || e.code === "NumpadAdd" || e.code === "BracketRight") {
    const idx = SPEED_TIERS.indexOf(simSpeed);
    if (idx !== -1 && idx < SPEED_TIERS.length - 1) simSpeed = SPEED_TIERS[idx + 1];
    else simSpeed = Math.min(32, simSpeed * 2);
    if (shader) shader.exports.wasm_set_tps(Math.round(60 * simSpeed));
  } else if (e.code === "Minus" || e.code === "NumpadSubtract" || e.code === "BracketLeft") {
    const idx = SPEED_TIERS.indexOf(simSpeed);
    if (idx > 0) simSpeed = SPEED_TIERS[idx - 1];
    else simSpeed = Math.max(0.25, simSpeed / 2);
    if (shader) shader.exports.wasm_set_tps(Math.round(60 * simSpeed));
  } else if (e.code === "Digit1") spawnEntityAtCamera(createKnight);
  else if (e.code === "Digit2") spawnEntityAtCamera(createArcher);
  else if (e.code === "Digit3") spawnEntityAtCamera(createWolf);
  else if (e.code === "Digit4") spawnEntityAtCamera(createBear);
  else if (e.code === "Digit5") spawnEntityAtCamera(createCat);
  else if (e.code === "Digit6") spawnEntityAtCamera(createGoblin);
  else if (e.code === "Digit7") spawnEntityAtCamera(createBat);
  else if (e.code === "Digit8") spawnEntityAtCamera(createSeaSerpent);
  else if (e.code === "Digit9") spawnEntityAtCamera(createDragon);
});

window.addEventListener("keyup", (e) => {
  keysDown.delete(e.code);
});

function handleCameraKeys(dt) {
  if (!shader || currentMode !== "MAP") return;
  let cx = shader.exports.wasm_get_camera_x();
  let cy = shader.exports.wasm_get_camera_y();
  let zoom = shader.exports.wasm_get_camera_zoom();

  const speed = (240.0 / zoom) * dt;

  if (keysDown.has("ArrowUp")) cy -= speed;
  if (keysDown.has("ArrowDown")) cy += speed;
  if (keysDown.has("ArrowLeft")) cx -= speed;
  if (keysDown.has("ArrowRight")) cx += speed;

  shader.exports.wasm_set_camera(cx, cy, zoom);
}

// ---------------------------------------------------------------------------
// Pure Rectangular NES Boxes & UI Helpers
// ---------------------------------------------------------------------------

function drawNESBox(x, y, w, h) {
  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.restore();
}

function drawNESButton(x, y, w, h, text, isSelected = false, isDanger = false) {
  const isHover = mouseX >= x && mouseX <= x + w && mouseY >= y && mouseY <= y + h;

  ctx.save();
  ctx.fillStyle = isDanger ? (isHover ? "#880000" : "#000000") : (isHover ? "#222222" : "#000000");
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = isSelected ? "#f8b800" : (isHover ? "#ffffff" : (isDanger ? "#e40058" : "#7c7c7c"));
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  const textCol = isDanger ? "#ff6060" : (isSelected || isHover ? "#f8b800" : "#ffffff");
  const prefix = isSelected || isHover ? "▶" : "";
  const fullText = `${prefix}${text}`;
  const textWidth = fullText.length * 8;
  const tx = Math.floor(x + (w - textWidth) / 2);
  const ty = Math.floor(y + (h - 8) / 2);

  drawText8x8(fullText, tx, ty, textCol, 1);
  ctx.restore();
}

function drawNESProgressBar(x, y, w, h, val, max, label, color = "#58d854") {
  const pct = Math.max(0, Math.min(1, max > 0 ? val / max : 0));
  ctx.save();

  ctx.fillStyle = "#000000";
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  if (pct > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(x + 3, y + 3, (w - 6) * pct, h - 6);
  }

  // Label in 8x8 font
  drawText8x8(label, x + 6, y + Math.floor((h - 8) / 2), "#ffffff", 1);

  const valStr = `${Math.round(val)}/${Math.round(max)}`;
  const valWidth = valStr.length * 8;
  drawText8x8(valStr, x + w - valWidth - 6, y + Math.floor((h - 8) / 2), "#f8b800", 1);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 1. Top HUD Bar & Bottom Action Toolbar (Embedded Font)
// ---------------------------------------------------------------------------

function renderTopHudBar() {
  if (!world) return;
  const clock = world.clock;

  drawNESBox(0, 0, CANVAS_WIDTH, 32);

  // Title
  drawText8x8("BRUTOPOLIS", 8, 12, "#f8b800", 1);

  // Time & Sun Stats
  const timeStr = `D${String(clock.day).padStart(2,"0")} ${String(clock.hour).padStart(2,"0")}:${String(clock.minute).padStart(2,"0")}`;
  drawText8x8(timeStr, 100, 12, "#ffffff", 1);

  drawText8x8(`SUN:${Math.round(clock.globalLight * 100)}%`, 188, 12, "#3cbcfc", 1);

  const presetNames = ["ARCHIPELAGO", "CONTINENT", "HIGHLANDS"];
  drawText8x8(presetNames[currentPreset] || "WORLD", 260, 12, "#58d854", 1);

  drawText8x8(`${currentFps}FPS`, 355, 12, "#bcbcbc", 1);

  // Speed Controls on HUD
  drawNESButton(412, 4, 18, 24, "-", false, false);
  registerClickableRegion(412, 4, 18, 24, () => {
    const idx = SPEED_TIERS.indexOf(simSpeed);
    if (idx > 0) simSpeed = SPEED_TIERS[idx - 1];
    else simSpeed = Math.max(0.25, simSpeed / 2);
    if (shader) shader.exports.wasm_set_tps(Math.round(60 * simSpeed));
  });

  const speedStr = `${simSpeed}X (${Math.round(60 * simSpeed)}TPS)`;
  drawText8x8(speedStr, 436, 12, "#f8b800", 1);
  registerClickableRegion(436, 4, speedStr.length * 8 + 8, 24, () => {
    const idx = SPEED_TIERS.indexOf(simSpeed);
    simSpeed = SPEED_TIERS[(idx + 1) % SPEED_TIERS.length];
    if (shader) shader.exports.wasm_set_tps(Math.round(60 * simSpeed));
  });

  const plusX = 444 + speedStr.length * 8;
  drawNESButton(plusX, 4, 18, 24, "+", false, false);
  registerClickableRegion(plusX, 4, 18, 24, () => {
    const idx = SPEED_TIERS.indexOf(simSpeed);
    if (idx !== -1 && idx < SPEED_TIERS.length - 1) simSpeed = SPEED_TIERS[idx + 1];
    else simSpeed = Math.min(32, simSpeed * 2);
    if (shader) shader.exports.wasm_set_tps(Math.round(60 * simSpeed));
  });

  // Export Chronicle Button
  drawNESButton(CANVAS_WIDTH - 242, 4, 76, 24, "EXPORT", false, false);
  registerClickableRegion(CANVAS_WIDTH - 242, 4, 76, 24, () => {
    downloadChronicleJSON(world, entities, currentTick, entityRegistry);
  });

  // Reset Button
  drawNESButton(CANVAS_WIDTH - 162, 4, 76, 24, "RESET", false, false);
  registerClickableRegion(CANVAS_WIDTH - 162, 4, 76, 24, () => resetWorld((currentPreset + 1) % 3));

  // Pause / Run Button
  const pauseTxt = isPaused ? "PAUSE" : "RUN";
  drawNESButton(CANVAS_WIDTH - 82, 4, 76, 24, pauseTxt, !isPaused, isPaused);
  registerClickableRegion(CANVAS_WIDTH - 82, 4, 76, 24, togglePause);
}

function renderBottomToolbar() {
  drawNESBox(0, CANVAS_HEIGHT - 36, CANVAS_WIDTH, 36);

  const buttons = [
    { label: "DOSSIER", mode: "INSPECT" },
    { label: "ENTITIES", mode: "ENTITIES" },
    { label: "GROUPS", mode: "GROUPS" },
    { label: "LOGS", mode: "LOGS" },
    {
      label: "EDITOR",
      isEditorBtn: true,
      action: () => {
        isEditorOpen = !isEditorOpen;
        if (isEditorOpen) {
          if (!editorTool) editorTool = "PAINT";
        } else {
          editorTool = null;
          editorActiveSpawner = null;
          isPainting = false;
        }
      }
    },
    { label: "NEXT", action: cycleNextLivingEntity },
    { label: "CENTER", action: centerCamera }
  ];

  let btnX = 8;
  for (const b of buttons) {
    const isAct = b.isEditorBtn ? isEditorOpen : currentMode === b.mode;
    const bw = b.label.length * 8 + 18;
    drawNESButton(btnX, CANVAS_HEIGHT - 30, bw, 24, b.label, isAct, false);

    const targetMode = b.mode;
    const targetAction = b.action;
    registerClickableRegion(btnX, CANVAS_HEIGHT - 30, bw, 24, () => {
      if (targetAction) {
        targetAction();
      } else if (targetMode) {
        currentMode = currentMode === targetMode ? "MAP" : targetMode;
        modalScroll = 0;
        inspectingLogEvent = null;
      }
    });

    btnX += bw + 6;
  }

  // Hover Tile / Target Summary
  if (shader && world) {
    const zoom = shader.exports.wasm_get_camera_zoom();
    const tileSize = 16.0 * zoom;
    const cx = shader.exports.wasm_get_camera_x();
    const cy = shader.exports.wasm_get_camera_y();
    const hoverTileX = Math.floor(cx + (mouseX - CANVAS_WIDTH / 2) / tileSize);
    const hoverTileY = Math.floor(cy + (mouseY - CANVAS_HEIGHT / 2) / tileSize);

    const tile = world.getTile(hoverTileX, hoverTileY);
    const tileName = (world.getTileName(tile) || "VOID").toUpperCase();
    const hoverInfo = `[${hoverTileX},${hoverTileY}] ${tileName}`;

    drawText8x8(hoverInfo, CANVAS_WIDTH - hoverInfo.length * 8 - 12, CANVAS_HEIGHT - 22, "#f8b800", 1);
  }
}

// ---------------------------------------------------------------------------
// 2. In-Engine Modal 1: Biological Dossier Screen ([I])
// ---------------------------------------------------------------------------

function renderDossierModal() {
  const mx = 40;
  const my = 40;
  const mw = CANVAS_WIDTH - 80;
  const mh = CANVAS_HEIGHT - 86;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
  ctx.fillRect(0, 32, CANVAS_WIDTH, CANVAS_HEIGHT - 68);

  drawNESBox(mx, my, mw, mh);

  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    if (inspectingLogEvent) inspectingLogEvent = null;
    else currentMode = "MAP";
  });

  // If viewing a specific event detail from creature chronicle:
  if (inspectingLogEvent) {
    renderLogDetailView(mx, my, mw, mh, inspectingLogEvent);
    ctx.restore();
    return;
  }

  const target = getEntityById(lastSelectedId) || entityRegistry.get(lastSelectedId);

  if (!target) {
    drawText8x8("NO CREATURE SELECTED", mx + 20, my + 30, "#f8b800", 1);
    drawText8x8("CLICK ON MAP OR PRESS [TAB] TO SELECT.", mx + 20, my + 50, "#ffffff", 1);
    ctx.restore();
    return;
  }

  const props = target.properties || {};
  const name = (props.name || `ENTITY #${target.id}`).toUpperCase();
  const species = (props.species || "UNKNOWN").toUpperCase();
  const groupName = (props.group?.name || "SOLITARY").toUpperCase();

  // Title
  drawText8x8(`DOSSIER: ${name} (#${target.id})`, mx + 16, my + 14, "#f8b800", 1);

  // Action Buttons
  if (!target.destroyed) {
    drawNESButton(mx + mw - 195, my + 6, 75, 24, "FOCUS", false, false);
    registerClickableRegion(mx + mw - 195, my + 6, 75, 24, centerCamera);

    drawNESButton(mx + mw - 112, my + 6, 75, 24, "KILL", false, true);
    registerClickableRegion(mx + mw - 112, my + 6, 75, 24, () => {
      explodeEntityOnDeath(target, entities, world);
      destroyEntity(target, entities);
      cycleNextLivingEntity();
    });
  }

  // Calculate Tab Counts
  const knownAffinities = Object.entries(props.brain?.affinities || {});
  const offspringList = props.life?.childrenIds || [];
  const creatureEvents = getEventsForEntity(target.id, 60);

  // Modal Tabs Bar
  const tabs = [
    { id: "OVERVIEW", label: "OVERVIEW" },
    { id: "AFFINITIES", label: `AFFINITIES (${knownAffinities.length})` },
    { id: "OFFSPRING", label: `OFFSPRING (${offspringList.length})` },
    { id: "CHRONICLE", label: `CHRONICLE (${creatureEvents.length})` }
  ];

  let tabX = mx + 16;
  for (const t of tabs) {
    const isAct = dossierTab === t.id;
    const tabW = t.label.length * 8 + 14;
    drawNESButton(tabX, my + 36, tabW, 22, t.label, isAct, false);
    registerClickableRegion(tabX, my + 36, tabW, 22, () => {
      dossierTab = t.id;
      modalScroll = 0;
    });
    tabX += tabW + 6;
  }

  // ---------------------------------------------------------------------------
  // TAB 1: OVERVIEW
  // ---------------------------------------------------------------------------
  if (dossierTab === "OVERVIEW") {
    // 1. Top Summary Info Box
    drawNESBox(mx + 10, my + 62, mw - 20, 48);
    drawText8x8(`SPECIES: ${species}`, mx + 20, my + 70, "#3cbcfc", 1);
    drawText8x8(`CLAN: ${groupName}`, mx + 240, my + 70, "#d3869b", 1);
    drawText8x8(`POS: [${target.x},${target.y}]`, mx + 490, my + 70, "#f8b800", 1);

    const isAlive = !target.destroyed && props.life && props.life.energy > 0;
    const statusTxt = isAlive ? "STATUS: LIVE" : "STATUS: DECEASED";
    const statusCol = isAlive ? "#58d854" : "#f83800";
    drawText8x8(statusTxt, mx + 20, my + 88, statusCol, 1);
    drawText8x8(`PROPERTIES: ${Object.keys(props).length}`, mx + 240, my + 88, "#bcbcbc", 1);

    const domains = [];
    if (props.terrestrial) domains.push("TERRESTRIAL");
    if (props.aquatic) domains.push("AQUATIC");
    if (props.flying) domains.push("FLYING");
    const domainStr = domains.length > 0 ? domains.join("+") : "STATIC";
    drawText8x8(`DOMAIN: ${domainStr}`, mx + 440, my + 88, "#58d854", 1);

    const lineageY = my + 114;
    drawNESBox(mx + 10, lineageY, mw - 20, 52);
    drawText8x8("FAMILY & LINEAGE:", mx + 20, lineageY + 8, "#f8b800", 1);

    const orientStr = props.homosexual ? "HOMOSEXUAL" : props.bisexual ? "BISEXUAL" : "HETEROSEXUAL";
    const orientCol = props.homosexual ? "#ff60a0" : props.bisexual ? "#d3869b" : "#3cbcfc";
    drawText8x8(`ORIENTATION: ${orientStr}`, mx + 450, lineageY + 8, orientCol, 1);

    // Perks & Traits
    const perks = [];
    if (props.skeptic) perks.push("SKEPTIC 🧐");
    if (props.gullible) perks.push("GULLIBLE 🥺");
    if (props.schizophrenic) perks.push("SCHIZOPHRENIC 🌀");
    if (props.liar) perks.push(props.liar.type === "believer" ? "BELIEVER 🤥" : "LIAR 🤥");
    if (perks.length > 0) {
      drawText8x8(`PERKS: [${perks.join(" | ")}]`, mx + 20, lineageY + 8, "#ffd700", 1);
    }

    // Father
    const fatherId = props.fatherId !== undefined ? props.fatherId : props.life?.fatherId;
    if (fatherId !== null && fatherId !== undefined) {
      const father = entityRegistry.get(fatherId);
      const fName = (father?.properties?.name || `Entity #${fatherId}`).toUpperCase().slice(0, 16);
      drawText8x8("FATHER:", mx + 20, lineageY + 28, "#bcbcbc", 1);
      drawNESButton(mx + 80, lineageY + 22, 140, 20, fName, false, false);
      registerClickableRegion(mx + 80, lineageY + 22, 140, 20, () => {
        lastSelectedId = fatherId;
        modalScroll = 0;
      });
    } else {
      drawText8x8("FATHER: Deus ex machina", mx + 20, lineageY + 28, "#7c7c7c", 1);
    }

    // Mother
    const motherId = props.motherId !== undefined ? props.motherId : props.life?.motherId;
    if (motherId !== null && motherId !== undefined) {
      const mother = entityRegistry.get(motherId);
      const mName = (mother?.properties?.name || `Entity #${motherId}`).toUpperCase().slice(0, 16);
      drawText8x8("MOTHER:", mx + 235, lineageY + 28, "#bcbcbc", 1);
      drawNESButton(mx + 295, lineageY + 22, 140, 20, mName, false, false);
      registerClickableRegion(mx + 295, lineageY + 22, 140, 20, () => {
        lastSelectedId = motherId;
        modalScroll = 0;
      });
    } else {
      drawText8x8("MOTHER: Deus ex machina", mx + 235, lineageY + 28, "#7c7c7c", 1);
    }

    // Partner
    const partnerId = props.monogamy?.partnerId;
    if (partnerId) {
      const partner = entityRegistry.get(partnerId);
      const pName = (partner?.properties?.name || `Entity #${partnerId}`).toUpperCase().slice(0, 14);
      drawText8x8("PARTNER:", mx + 450, lineageY + 28, "#bcbcbc", 1);
      drawNESButton(mx + 520, lineageY + 22, 150, 20, `${pName} ❤️`, false, false);
      registerClickableRegion(mx + 520, lineageY + 22, 150, 20, () => {
        lastSelectedId = partnerId;
        modalScroll = 0;
      });
    } else {
      drawText8x8("PARTNER: Single", mx + 450, lineageY + 28, "#7c7c7c", 1);
    }

    // 3. Vital Gauges
    let gaugeY = lineageY + 56;
    if (props.life) {
      drawNESProgressBar(mx + 10, gaugeY, mw - 20, 16, props.life.energy, props.life.max || 100, "HP ENERGY", "#58d854");
      gaugeY += 20;
    }

    if (props.stomach) {
      const fatUnits = props.stomach.fatUnits || 0;
      const maxFat = props.stomach.maxFatUnits || 6;
      drawNESProgressBar(mx + 10, gaugeY, mw - 20, 16, fatUnits, maxFat, `BODY FAT RESERVES: ${fatUnits}/${maxFat} UNITS (50% HP BACKUP)`, "#e4c858");
      gaugeY += 20;
    }

    const condProp = Object.values(props).find(p => p && typeof p.condition === "number" && typeof p.maxCondition === "number");
    if (condProp) {
      drawNESProgressBar(mx + 10, gaugeY, mw - 20, 16, condProp.condition, condProp.maxCondition, "BODY CONDITION", "#3cbcfc");
      gaugeY += 20;
    }

    if (props.bladder) {
      drawNESProgressBar(mx + 10, gaugeY, mw - 20, 16, props.bladder.water, props.bladder.maxWater, "WATER BLADDER", "#0078f8");
      gaugeY += 20;
    }

    if (props.brain && typeof props.brain.mood === "number") {
      const moodVal = props.brain.mood;
      const moodCol = moodVal >= 25 ? "#58d854" : moodVal >= -20 ? "#3cbcfc" : "#f83800";
      drawNESProgressBar(mx + 10, gaugeY, mw - 20, 16, moodVal + 100, 200, `MOOD: ${getMoodLabel(moodVal).toUpperCase()}`, moodCol);
      gaugeY += 20;
    }

    // 4. Raw Memory Property Dump Box
    const dumpY = gaugeY + 4;
    const dumpH = (my + mh - 12) - dumpY;
    drawNESBox(mx + 10, dumpY, mw - 20, dumpH);

    const lines = [];
    lines.push("--- RAW MEMORY PROPERTY BAG ---");

    for (const [k, v] of Object.entries(props)) {
      if (typeof v === "object" && v !== null) {
        lines.push(`+ [${k.toUpperCase()}]:`);
        for (const [subk, subv] of Object.entries(v)) {
          if (typeof subv === "function") lines.push(`   ${subk.toUpperCase()}: (FN)`);
          else if (Array.isArray(subv)) lines.push(`   ${subk.toUpperCase()}: [${subv.length}]`);
          else if (typeof subv === "object" && subv !== null) lines.push(`   ${subk.toUpperCase()}: (OBJ)`);
          else lines.push(`   ${subk.toUpperCase()}: ${subv}`);
        }
      } else {
        lines.push(`+ ${k.toUpperCase()}: ${v}`);
      }
    }

    const maxScroll = Math.max(0, lines.length - Math.floor(dumpH / 14));
    modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

    let textY = dumpY + 12;
    const visibleCount = Math.floor((dumpH - 12) / 14);

    for (let i = modalScroll; i < Math.min(lines.length, modalScroll + visibleCount); i++) {
      const line = lines[i];
      const col = line.startsWith("---") ? "#f8b800" : line.startsWith("+ [") ? "#3cbcfc" : "#ffffff";
      drawText8x8(line.slice(0, 76), mx + 20, textY, col, 1);
      textY += 14;
    }
  }

  // ---------------------------------------------------------------------------
  // TAB 2: AFFINITIES (Known living & deceased creatures)
  // ---------------------------------------------------------------------------
  else if (dossierTab === "AFFINITIES") {
    const listY = my + 62;
    const listH = mh - 72;
    drawNESBox(mx + 10, listY, mw - 20, listH);

    if (knownAffinities.length === 0) {
      drawText8x8("NO KNOWN CREATURE AFFINITIES IN MEMORY.", mx + 24, listY + 24, "#bcbcbc", 1);
    } else {
      const rowH = 26;
      const visibleRows = Math.floor((listH - 20) / rowH);
      const maxScroll = Math.max(0, knownAffinities.length - visibleRows);
      modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

      let curY = listY + 12;
      for (let i = modalScroll; i < Math.min(knownAffinities.length, modalScroll + visibleRows); i++) {
        const [otherIdStr, affVal] = knownAffinities[i];
        const otherId = parseInt(otherIdStr, 10);
        const other = entityRegistry.get(otherId);

        const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= curY && mouseY <= curY + rowH;
        if (isHover) {
          ctx.fillStyle = "#181828";
          ctx.fillRect(mx + 12, curY, mw - 24, rowH);
        }

        const isOtherAlive = other && !other.destroyed && other.properties?.life?.energy > 0;
        const statusBadge = isOtherAlive ? "[ALIVE]" : "[DEAD]";
        const statusCol = isOtherAlive ? "#58d854" : "#9c5050";
        drawText8x8(statusBadge, mx + 20, curY + 6, statusCol, 1);

        const oName = (other?.properties?.name || `Entity #${otherId}`).slice(0, 20);
        drawText8x8(oName, mx + 85, curY + 6, "#ffffff", 1);

        // Relationship badge
        const isPartner = props.monogamy?.partnerId === otherId;
        let relBadge = isPartner ? "❤️ LOVER" : affVal >= 60 ? "💚 CLOSE FRIEND" : affVal >= 20 ? "🙂 FRIEND" : affVal <= -50 ? "💀 ENEMY" : affVal <= -15 ? "😠 RIVAL" : "😐 NEUTRAL";
        let relCol = isPartner ? "#ff60a0" : affVal >= 20 ? "#58d854" : affVal <= -15 ? "#f83800" : "#bcbcbc";
        drawText8x8(relBadge, mx + 260, curY + 6, relCol, 1);

        // Affinity bar
        drawNESProgressBar(mx + 410, curY + 2, 160, 18, affVal + 100, 200, `AFF: ${Math.round(affVal)}`, relCol);

        // Inspect Button
        drawNESButton(mx + mw - 95, curY + 2, 75, 20, "INSPECT", false, false);
        registerClickableRegion(mx + mw - 95, curY + 2, 75, 20, () => {
          lastSelectedId = otherId;
          modalScroll = 0;
        });

        curY += rowH;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // TAB 3: OFFSPRING (Children lineage)
  // ---------------------------------------------------------------------------
  else if (dossierTab === "OFFSPRING") {
    const listY = my + 62;
    const listH = mh - 72;
    drawNESBox(mx + 10, listY, mw - 20, listH);

    if (offspringList.length === 0) {
      drawText8x8("NO OFFSPRING RECORDED FOR THIS CREATURE.", mx + 24, listY + 24, "#bcbcbc", 1);
    } else {
      const rowH = 26;
      const visibleRows = Math.floor((listH - 20) / rowH);
      const maxScroll = Math.max(0, offspringList.length - visibleRows);
      modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

      let curY = listY + 12;
      for (let i = modalScroll; i < Math.min(offspringList.length, modalScroll + visibleRows); i++) {
        const childId = offspringList[i];
        const child = entityRegistry.get(childId);

        const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= curY && mouseY <= curY + rowH;
        if (isHover) {
          ctx.fillStyle = "#181828";
          ctx.fillRect(mx + 12, curY, mw - 24, rowH);
        }

        const isChildAlive = child && !child.destroyed && child.properties?.life?.energy > 0;
        const statusBadge = isChildAlive ? "[ALIVE]" : "[DEAD]";
        const statusCol = isChildAlive ? "#58d854" : "#9c5050";
        drawText8x8(statusBadge, mx + 20, curY + 6, statusCol, 1);

        const cName = (child?.properties?.name || `Child #${childId}`).slice(0, 24);
        drawText8x8(cName, mx + 85, curY + 6, "#ffffff", 1);

        const gender = child?.properties?.genitalia?.type === "vagina" || child?.properties?.genitalia?.type === "female" ? "FEMALE" : "MALE";
        drawText8x8(`[${gender}]`, mx + 310, curY + 6, gender === "FEMALE" ? "#ffb4c8" : "#3cbcfc", 1);

        const clanStr = (child?.properties?.group?.name || "SOLITARY").slice(0, 14);
        drawText8x8(`CLAN: ${clanStr}`, mx + 410, curY + 6, "#d3869b", 1);

        // Inspect Button
        drawNESButton(mx + mw - 95, curY + 2, 75, 20, "INSPECT", false, false);
        registerClickableRegion(mx + mw - 95, curY + 2, 75, 20, () => {
          lastSelectedId = childId;
          modalScroll = 0;
        });

        curY += rowH;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // TAB 4: CHRONICLE (Creature Life Chronicle)
  // ---------------------------------------------------------------------------
  else if (dossierTab === "CHRONICLE") {
    const listY = my + 62;
    const listH = mh - 72;
    drawNESBox(mx + 10, listY, mw - 20, listH);

    if (creatureEvents.length === 0) {
      drawText8x8("NO WORLD EVENTS RECORDED INVOLVING THIS CREATURE.", mx + 24, listY + 24, "#bcbcbc", 1);
    } else {
      const rowH = 26;
      const visibleRows = Math.floor((listH - 20) / rowH);
      const maxScroll = Math.max(0, creatureEvents.length - visibleRows);
      modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

      let curY = listY + 12;
      for (let i = modalScroll; i < Math.min(creatureEvents.length, modalScroll + visibleRows); i++) {
        const ev = creatureEvents[i];
        const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= curY && mouseY <= curY + rowH;

        if (isHover) {
          ctx.fillStyle = "#181828";
          ctx.fillRect(mx + 12, curY, mw - 24, rowH);
        }

        const ts = ev.timestamp ? `D${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2, "0")}:${String(ev.timestamp.minute).padStart(2, "0")}` : `T${ev.tick}`;
        drawText8x8(ts, mx + 18, curY + 7, "#bcbcbc", 1);

        const typeColor = ev.type === "KILL" ? "#ff2040" : ev.type === "DEATH" ? "#9c5050" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#e40058" : ev.type === "RELATION" ? "#d3869b" : ev.type === "DIALOGUE" ? "#3cbcfc" : ev.type === "BIRTH" ? "#f8b800" : ev.type === "SPROUT" ? "#58d854" : "#ffffff";
        drawText8x8(`[${ev.type}]`, mx + 110, curY + 7, typeColor, 1);

        const desc = (ev.description || "Event").slice(0, 48);
        drawText8x8(desc, mx + 225, curY + 7, "#ffffff", 1);

        // Click row to inspect
        const curEv = ev;
        registerClickableRegion(mx + 12, curY, mw - 180, rowH, () => {
          inspectingLogEvent = curEv;
          inspectingFromCreature = true;
        });

        // MAP Jump
        if (ev.location) {
          drawNESButton(mx + mw - 165, curY + 2, 45, 20, "MAP", false, false);
          registerClickableRegion(mx + mw - 165, curY + 2, 45, 20, () => {
            if (shader) {
              shader.exports.wasm_set_camera(ev.location.x, ev.location.y, shader.exports.wasm_get_camera_zoom());
              currentMode = "MAP";
            }
          });
        }

        // INSPECT Detail
        drawNESButton(mx + mw - 110, curY + 2, 90, 20, "INSPECT", false, false);
        registerClickableRegion(mx + mw - 110, curY + 2, 90, 20, () => {
          inspectingLogEvent = curEv;
          inspectingFromCreature = true;
        });

        curY += rowH;
      }
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 3. In-Engine Modal 2: Entities Registry Screen ([E])
// ---------------------------------------------------------------------------

function getFilteredEntities() {
  return entities.filter(e => {
    if (e.destroyed) return false;
    if (entityFilter === "LIVING") return !!e.properties.life && e.properties.species !== "item";
    if (entityFilter === "ITEMS") return !!e.properties.edible || !!e.properties.resourceType || !!e.properties.germination || e.properties.species === "item";
    if (entityFilter === "HUMANOID") return !e.properties.edible && e.properties.species !== "item" && !!e.properties.life && (e.properties.species === "human" || e.properties.species === "goblin" || e.properties.name?.includes("Knight") || e.properties.name?.includes("Archer") || e.properties.name?.includes("Goblin") || e.properties.name?.includes("Human"));
    if (entityFilter === "BEAST") return !e.properties.edible && e.properties.species !== "item" && (e.properties.species === "wolf" || e.properties.species === "bear" || e.properties.species === "cat" || e.properties.species === "scorpion" || e.properties.species === "lizard" || e.properties.species === "goat" || e.properties.species === "dragon" || e.properties.species === "bat" || e.properties.species === "serpent");
    if (entityFilter === "FLORA") return e.properties.species === "oak" || e.properties.species === "willow" || e.properties.species === "pine" || e.properties.species === "cactus" || e.properties.species === "shrub";
    return true;
  });
}

function renderEntitiesModal() {
  const mx = 30;
  const my = 40;
  const mw = CANVAS_WIDTH - 60;
  const mh = CANVAS_HEIGHT - 86;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
  ctx.fillRect(0, 32, CANVAS_WIDTH, CANVAS_HEIGHT - 68);

  drawNESBox(mx, my, mw, mh);

  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => { currentMode = "MAP"; });

  const list = getFilteredEntities();
  drawText8x8(`ENTITIES (${list.length})`, mx + 16, my + 14, "#f8b800", 1);

  // Filter Buttons
  const filters = ["ALL", "LIVING", "HUMANOID", "BEAST", "FLORA", "ITEMS"];
  let fx = mx + 16;
  for (const f of filters) {
    const isAct = entityFilter === f;
    const fw = f.length * 8 + 16;
    drawNESButton(fx, my + 36, fw, 22, f, isAct, false);
    registerClickableRegion(fx, my + 36, fw, 22, () => {
      entityFilter = f;
      modalScroll = 0;
    });
    fx += fw + 6;
  }

  // Table Box
  const tableY = my + 64;
  const tableH = mh - 74;
  drawNESBox(mx + 10, tableY, mw - 20, tableH);

  // Column Headers
  drawText8x8("ID", mx + 20, tableY + 12, "#f8b800", 1);
  drawText8x8("NAME", mx + 65, tableY + 12, "#f8b800", 1);
  drawText8x8("SPECIES", mx + 250, tableY + 12, "#f8b800", 1);
  drawText8x8("POS", mx + 380, tableY + 12, "#f8b800", 1);
  drawText8x8("HP", mx + 470, tableY + 12, "#f8b800", 1);
  drawText8x8("STATUS", mx + 550, tableY + 12, "#f8b800", 1);
  drawText8x8("CLAN", mx + 635, tableY + 12, "#f8b800", 1);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mx + 12, tableY + 24);
  ctx.lineTo(mx + mw - 12, tableY + 24);
  ctx.stroke();

  // Rows
  const rowH = 20;
  const visibleRows = Math.floor((tableH - 28) / rowH);
  const maxScroll = Math.max(0, list.length - visibleRows);
  modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

  let rowY = tableY + 32;
  for (let i = modalScroll; i < Math.min(list.length, modalScroll + visibleRows); i++) {
    const ent = list[i];
    const isSelected = ent.id === lastSelectedId;
    const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= rowY - 4 && mouseY <= rowY + 16;

    if (isSelected || isHover) {
      ctx.fillStyle = isSelected ? "#222244" : "#181818";
      ctx.fillRect(mx + 12, rowY - 4, mw - 24, rowH);
    }

    const cursorPrefix = isSelected || isHover ? "▶" : " ";
    drawText8x8(`${cursorPrefix}#${ent.id}`, mx + 16, rowY + 2, isSelected || isHover ? "#f8b800" : "#ffffff", 1);
    drawText8x8((ent.properties.name || "ENTITY").slice(0, 18).toUpperCase(), mx + 65, rowY + 2, "#ffffff", 1);
    drawText8x8((ent.properties.species || "-").slice(0, 10).toUpperCase(), mx + 250, rowY + 2, "#3cbcfc", 1);
    drawText8x8(`[${ent.x},${ent.y}]`, mx + 380, rowY + 2, "#bcbcbc", 1);

    const energyStr = ent.properties.life ? `${Math.round(ent.properties.life.energy)}` : "-";
    drawText8x8(energyStr, mx + 470, rowY + 2, "#58d854", 1);

    const statusStr = ent.properties.life ? (ent.properties.life.energy > 0 ? "LIVE" : "DEAD") : "ITEM";
    const statusCol = ent.properties.life ? (ent.properties.life.energy > 0 ? "#58d854" : "#f83800") : "#f8b800";
    drawText8x8(statusStr, mx + 550, rowY + 2, statusCol, 1);
    drawText8x8((ent.properties.group?.name || "-").slice(0, 9).toUpperCase(), mx + 635, rowY + 2, "#d3869b", 1);

    const curEnt = ent;
    registerClickableRegion(mx + 12, rowY - 4, mw - 24, rowH, () => {
      lastSelectedId = curEnt.id;
      if (shader) {
        shader.exports.wasm_select_entity(curEnt.id);
        shader.exports.wasm_set_camera(curEnt.x, curEnt.y, shader.exports.wasm_get_camera_zoom());
      }
      currentMode = "INSPECT";
    });

    rowY += rowH;
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 4. In-Engine Modal 3: Groups Registry Screen ([G])
// ---------------------------------------------------------------------------

function getAllGroups() {
  const map = new Map();
  for (const e of entities) {
    if (e.destroyed) continue;
    if (e.properties && e.properties.group) {
      const g = e.properties.group;
      if (!map.has(g.id)) map.set(g.id, g);
    }
  }
  return Array.from(map.values());
}

function renderGroupsModal() {
  const mx = 40;
  const my = 40;
  const mw = CANVAS_WIDTH - 80;
  const mh = CANVAS_HEIGHT - 86;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
  ctx.fillRect(0, 32, CANVAS_WIDTH, CANVAS_HEIGHT - 68);

  drawNESBox(mx, my, mw, mh);

  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    if (inspectingLogEvent) inspectingLogEvent = null;
    else if (inspectingGroup) inspectingGroup = null;
    else currentMode = "MAP";
  });

  // If viewing a specific event detail from clan history:
  if (inspectingLogEvent) {
    renderLogDetailView(mx, my, mw, mh, inspectingLogEvent);
    ctx.restore();
    return;
  }

  // If viewing full Clan Dossier / Stockpile Detail
  if (inspectingGroup) {
    renderGroupDetailView(mx, my, mw, mh, inspectingGroup);
    ctx.restore();
    return;
  }

  const groups = getAllGroups();
  drawText8x8(`CLANS & FACTIONS (${groups.length}) - CLICK DETAILS TO INSPECT`, mx + 16, my + 14, "#f8b800", 1);

  if (groups.length === 0) {
    drawText8x8("NO FACTIONS FOUNDED YET.", mx + 20, my + 50, "#ffffff", 1);
    ctx.restore();
    return;
  }

  const cardW = mw - 24;
  const cardH = 88;
  const cardGap = 6;
  let cardY = my + 38;

  const visibleClanCount = 4;
  const maxScroll = Math.max(0, groups.length - visibleClanCount);
  modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

  for (let i = modalScroll; i < Math.min(groups.length, modalScroll + visibleClanCount); i++) {
    const g = groups[i];
    const livingMembers = g.members.filter(mid => entities.some(e => e.id === mid && !e.destroyed)).length;
    const leaderEnt = entities.find(e => e.id === g.members[0] && !e.destroyed);
    const stockpile = getGroupStockpile(g, entities);

    drawNESBox(mx + 12, cardY, cardW, cardH);

    drawText8x8(`* ${(g.name || "CLAN").toUpperCase()}`, mx + 24, cardY + 10, "#f8b800", 1);
    drawText8x8(`${livingMembers}/${g.members.length} ALIVE`, mx + cardW - 325, cardY + 10, "#58d854", 1);

    drawText8x8(`LEADER: ${leaderEnt ? leaderEnt.properties.name.toUpperCase() : `MEMBER #${g.members[0]}`}`, mx + 24, cardY + 26, "#ffffff", 1);
    drawText8x8(`TERRITORY: ${g.claimedZones?.join(", ") || "NONE"} (${(g.claimedZones?.length || 0) * 64} TILES)`, mx + 24, cardY + 40, "#bcbcbc", 1);

    // Stockpile Summary
    const stockEntries = Object.entries(stockpile.items);
    let stockStr = "EMPTY";
    if (stockEntries.length > 0) {
      stockStr = stockEntries.map(([name, count]) => `${name}: x${count}`).join(" | ");
    }
    const maxStockLen = Math.floor((cardW - 40) / 8);
    if (stockStr.length > maxStockLen) {
      stockStr = stockStr.slice(0, maxStockLen - 3) + "...";
    }

    drawText8x8(`STOCKPILE (${stockpile.totalCount} ITEMS): ${stockStr.toUpperCase()}`, mx + 24, cardY + 54, "#ffd700", 1);
    drawText8x8(`LOCATION: [GROUND: ${stockpile.breakdown.ground} | MEMBERS: ${stockpile.breakdown.members} | STORAGE: ${stockpile.breakdown.storage}]`, mx + 24, cardY + 68, "#3cbcfc", 1);

    // Full Details Button
    const curG = g;
    drawNESButton(mx + cardW - 255, cardY + 24, 80, 22, "DETAILS", false, false);
    registerClickableRegion(mx + cardW - 255, cardY + 24, 80, 22, () => {
      inspectingGroup = curG;
      groupDetailTab = "OVERVIEW";
      modalScroll = 0;
    });

    // View Claimed Territory Button
    const isViewing = visualizedGroupId === g.id;
    drawNESButton(mx + cardW - 170, cardY + 24, 80, 22, isViewing ? "ZONE*" : "ZONE", isViewing, false);
    registerClickableRegion(mx + cardW - 170, cardY + 24, 80, 22, () => {
      visualizedGroupId = g.id;
      let sumX = 0, sumY = 0, count = 0;
      for (const zk of g.claimedZones || []) {
        const coords = parseZoneCoords(zk);
        if (coords) {
          sumX += coords.centerX;
          sumY += coords.centerY;
          count++;
        }
      }
      if (count > 0 && shader) {
        shader.exports.wasm_set_camera(sumX / count, sumY / count, 1.5);
      }
      currentMode = "MAP";
    });

    // Focus Leader Button
    drawNESButton(mx + cardW - 85, cardY + 24, 75, 22, "LEADER", false, false);
    registerClickableRegion(mx + cardW - 85, cardY + 24, 75, 22, () => {
      if (leaderEnt && shader) {
        lastSelectedId = leaderEnt.id;
        shader.exports.wasm_select_entity(leaderEnt.id);
        shader.exports.wasm_set_camera(leaderEnt.x, leaderEnt.y, shader.exports.wasm_get_camera_zoom());
        currentMode = "MAP";
      }
    });

    cardY += cardH + cardGap;
  }

  ctx.restore();
}

/**
 * Full-screen Clan Dossier: detailed territory, itemized stockpile, member roster, and complete history.
 */
function renderGroupDetailView(mx, my, mw, mh, g) {
  const livingMembers = g.members.filter(mid => entities.some(e => e.id === mid && !e.destroyed));
  const leaderEnt = entities.find(e => e.id === (g.leaderId || g.members[0]) && !e.destroyed);
  const stockpile = getGroupStockpile(g, entities);
  const groupEvents = getEventsForGroup(g, 100);

  drawText8x8(`CLAN DOSSIER: ${(g.name || "CLAN").toUpperCase()}`, mx + 16, my + 14, "#f8b800", 1);

  // Top Tabs
  const isOverview = groupDetailTab === "OVERVIEW";
  drawNESButton(mx + 16, my + 32, 100, 24, "OVERVIEW", isOverview, false);
  registerClickableRegion(mx + 16, my + 32, 100, 24, () => {
    groupDetailTab = "OVERVIEW";
    modalScroll = 0;
  });

  const isHistory = groupDetailTab === "HISTORY";
  const histTabLabel = `HISTORY (${groupEvents.length})`;
  const histTabWidth = histTabLabel.length * 8 + 20;
  drawNESButton(mx + 122, my + 32, histTabWidth, 24, histTabLabel, isHistory, false);
  registerClickableRegion(mx + 122, my + 32, histTabWidth, 24, () => {
    groupDetailTab = "HISTORY";
    modalScroll = 0;
  });

  // Top Action Buttons
  drawNESButton(mx + mw - 230, my + 32, 100, 24, "TERRITORY", false, false);
  registerClickableRegion(mx + mw - 230, my + 32, 100, 24, () => {
    visualizedGroupId = g.id;
    let sumX = 0, sumY = 0, count = 0;
    for (const zk of g.claimedZones || []) {
      const coords = parseZoneCoords(zk);
      if (coords) {
        sumX += coords.centerX;
        sumY += coords.centerY;
        count++;
      }
    }
    if (count > 0 && shader) {
      shader.exports.wasm_set_camera(sumX / count, sumY / count, 1.5);
    }
    currentMode = "MAP";
  });

  drawNESButton(mx + mw - 124, my + 32, 110, 24, "FOCUS LEADER", false, false);
  registerClickableRegion(mx + mw - 124, my + 32, 110, 24, () => {
    if (leaderEnt && shader) {
      lastSelectedId = leaderEnt.id;
      shader.exports.wasm_select_entity(leaderEnt.id);
      shader.exports.wasm_set_camera(leaderEnt.x, leaderEnt.y, shader.exports.wasm_get_camera_zoom());
      currentMode = "MAP";
    }
  });

  // -------------------------------------------------------------------------
  // TAB 1: OVERVIEW (Territory, Stockpile, Member Roster)
  // -------------------------------------------------------------------------
  if (isOverview) {
    // 1. Territory & Base Box
    const box1Y = my + 62;
    const box1H = 50;
    drawNESBox(mx + 12, box1Y, mw - 24, box1H);
    drawText8x8("TERRITORY & CLAIMED ZONES:", mx + 20, box1Y + 10, "#ffd700", 1);
    const zoneListStr = (g.claimedZones || []).map(zk => {
      const c = parseZoneCoords(zk);
      return c ? `${zk} [X:${c.minX}..${c.maxX}, Y:${c.minY}..${c.maxY}]` : zk;
    }).join(" | ");
    drawText8x8(zoneListStr || "NO CLAIMED ZONES", mx + 20, box1Y + 28, "#ffffff", 1);

    // 2. Complete Itemized Stockpile Box
    const box2Y = box1Y + box1H + 6;
    const box2H = 96;
    drawNESBox(mx + 12, box2Y, mw - 24, box2H);
    drawText8x8(`TOTAL STOCKPILE (${stockpile.totalCount} ITEMS AVAILABLE):`, mx + 20, box2Y + 10, "#ffd700", 1);
    drawText8x8(`BREAKDOWN: [ON TERRITORY GROUND: ${stockpile.breakdown.ground} | WITH MEMBERS: ${stockpile.breakdown.members} | IN CLAN STORAGE: ${stockpile.breakdown.storage}]`, mx + 20, box2Y + 26, "#3cbcfc", 1);

    const stockEntries = Object.entries(stockpile.items);
    let stockLinesY = box2Y + 44;
    if (stockEntries.length === 0) {
      drawText8x8("NO RESOURCES OR ITEMS IN STOCKPILE CURRENTLY.", mx + 20, stockLinesY, "#bcbcbc", 1);
    } else {
      const maxCharsPerLine = Math.floor((mw - 60) / 8);
      const stockFormatted = stockEntries.map(([name, count]) => `• ${name}: ${count} units`).join("   ");
      const wrappedStock = wrapText8x8(stockFormatted.toUpperCase(), maxCharsPerLine);
      for (const sLine of wrappedStock.slice(0, 3)) {
        drawText8x8(sLine, mx + 20, stockLinesY, "#58d854", 1);
        stockLinesY += 16;
      }
    }

    // 3. Member Roster & Hand Inventories Box
    const box3Y = box2Y + box2H + 6;
    const box3H = (my + mh - 12) - box3Y;
    drawNESBox(mx + 12, box3Y, mw - 24, box3H);
    drawText8x8(`MEMBER ROSTER (${livingMembers.length}/${g.members.length} ALIVE):`, mx + 20, box3Y + 10, "#ffd700", 1);

    let rosterY = box3Y + 28;
    for (let mi = 0; mi < g.members.length; mi++) {
      if (rosterY + 22 > box3Y + box3H) break;
      const mid = g.members[mi];
      const mEnt = entities.find(e => e.id === mid && !e.destroyed);

      const isAlive = !!mEnt;
      const isLeader = (mEnt && mEnt.id === g.leaderId);
      const leaderBadge = isLeader ? " [LEADER]" : "";
      const mName = mEnt ? `${mEnt.properties.name.toUpperCase()}${leaderBadge}` : `MEMBER #${mid} (DEAD)`;
      const mRole = mEnt ? (mEnt.properties.role || mEnt.properties.species || "HUMAN").toUpperCase() : "-";
      const hpStr = mEnt?.properties.life ? `${Math.round(mEnt.properties.life.energy)}HP` : "-";

      // Held items
      let heldStr = "HANDS: EMPTY";
      if (mEnt) {
        const left = mEnt.properties.arm_left?.heldItem;
        const right = mEnt.properties.arm_right?.heldItem;
        const held = [];
        if (left) held.push(`L:${left.resourceType || left.name || "ITEM"}`);
        if (right) held.push(`R:${right.resourceType || right.name || "ITEM"}`);
        if (held.length > 0) heldStr = held.join(" | ").toUpperCase();
      }

      const mText = `• ${mName} [${mRole}] - ${hpStr} | ${heldStr}`;
      drawText8x8(mText.slice(0, Math.floor((mw - 140) / 8)), mx + 20, rosterY + 4, isAlive ? "#ffffff" : "#9c5050", 1);

      if (mEnt) {
        const curM = mEnt;
        drawNESButton(mx + mw - 100, rosterY - 2, 70, 20, "FOCUS", false, false);
        registerClickableRegion(mx + mw - 100, rosterY - 2, 70, 20, () => {
          lastSelectedId = curM.id;
          if (shader) {
            shader.exports.wasm_select_entity(curM.id);
            shader.exports.wasm_set_camera(curM.x, curM.y, shader.exports.wasm_get_camera_zoom());
          }
          currentMode = "MAP";
        });
      }

      rosterY += 22;
    }
  }

  // -------------------------------------------------------------------------
  // TAB 2: HISTORY (Chronological Clan & Member Event Log)
  // -------------------------------------------------------------------------
  else if (isHistory) {
    const histBoxY = my + 62;
    const histBoxH = (my + mh - 12) - histBoxY;
    drawNESBox(mx + 12, histBoxY, mw - 24, histBoxH);

    drawText8x8("CHRONOLOGICAL CLAN EVENT HISTORY & PARTICIPANTS LOG:", mx + 20, histBoxY + 12, "#ffd700", 1);
    drawText8x8(`TRACKING ALL RECORDED EVENTS FOR ${(g.name || "CLAN").toUpperCase()} AND ALL ITS PARTICIPANTS`, mx + 20, histBoxY + 28, "#3cbcfc", 1);

    if (groupEvents.length === 0) {
      drawText8x8("NO HISTORICAL EVENTS RECORDED FOR THIS CLAN YET.", mx + 20, histBoxY + 54, "#bcbcbc", 1);
    } else {
      const eventsReversed = groupEvents.slice().reverse();
      const rowHeight = 26;
      const visibleCount = Math.floor((histBoxH - 52) / rowHeight);
      const maxScroll = Math.max(0, eventsReversed.length - visibleCount);
      modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

      let logY = histBoxY + 48;
      for (let i = modalScroll; i < Math.min(eventsReversed.length, modalScroll + visibleCount); i++) {
        const ev = eventsReversed[i];
        const isHover = mouseX >= mx + 16 && mouseX <= mx + mw - 170 && mouseY >= logY - 2 && mouseY <= logY + 22;
        if (isHover) {
          ctx.fillStyle = "#181828";
          ctx.fillRect(mx + 16, logY - 2, mw - 186, 24);
        }

        const typeCol = ev.type === "DEATH" ? "#f83800" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#d3869b" : ev.type === "BIRTH" ? "#58d854" : ev.type === "RELATION" ? "#f878f8" : "#3cbcfc";
        const timeStr = `[D${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2,"0")}:${String(ev.timestamp.minute).padStart(2,"0")}]`;

        // Type badge & time
        drawText8x8(`[${ev.type}]`, mx + 20, logY + 4, typeCol, 1);
        drawText8x8(timeStr, mx + 110, logY + 4, "#bcbcbc", 1);

        // Description text
        const maxDescChars = Math.floor((mw - 360) / 8);
        const descShort = ev.description.length > maxDescChars ? ev.description.slice(0, maxDescChars - 3) + "..." : ev.description;
        drawText8x8(descShort, mx + 210, logY + 4, "#ffffff", 1);

        const curEv = ev;
        // Click row to inspect
        registerClickableRegion(mx + 16, logY - 2, mw - 186, 24, () => {
          inspectingLogEvent = curEv;
        });

        // Inspect Button
        drawNESButton(mx + mw - 160, logY - 1, 72, 20, "INSPECT", false, false);
        registerClickableRegion(mx + mw - 160, logY - 1, 72, 20, () => {
          inspectingLogEvent = curEv;
        });

        // Locate Button
        drawNESButton(mx + mw - 80, logY - 1, 60, 20, "MAP", false, false);
        registerClickableRegion(mx + mw - 80, logY - 1, 60, 20, () => {
          if (shader && curEv.location) {
            shader.exports.wasm_set_camera(curEv.location.x, curEv.location.y, 2.0);
          }
          currentMode = "MAP";
        });

        logY += rowHeight;
      }
    }
  }
}

/**
 * Renders glowing claimed territory overlay on the world map for the selected clan.
 */
function renderTerritoryOverlay() {
  if (currentMode !== "MAP" || !shader || !world || visualizedGroupId === null) return;
  const groups = getAllGroups();
  const g = groups.find(grp => grp.id === visualizedGroupId);
  if (!g) {
    visualizedGroupId = null;
    return;
  }

  const zoom = shader.exports.wasm_get_camera_zoom();
  const tileSize = 16.0 * zoom;
  const cx = shader.exports.wasm_get_camera_x();
  const cy = shader.exports.wasm_get_camera_y();
  const centerScreenX = CANVAS_WIDTH / 2;
  const centerScreenY = CANVAS_HEIGHT / 2;

  ctx.save();

  // Draw Claimed Macro-Chunks
  for (const zk of g.claimedZones || []) {
    const coords = parseZoneCoords(zk);
    if (!coords) continue;

    const screenX = centerScreenX + (coords.minX - cx) * tileSize;
    const screenY = centerScreenY + (coords.minY - cy) * tileSize;
    const screenW = 8 * tileSize;
    const screenH = 8 * tileSize;

    // Only draw if on screen
    if (screenX + screenW < 0 || screenX > CANVAS_WIDTH || screenY + screenH < 0 || screenY > CANVAS_HEIGHT) continue;

    // Translucent Tinted Fill
    ctx.fillStyle = "rgba(248, 184, 0, 0.18)";
    ctx.fillRect(screenX, screenY, screenW, screenH);

    // Glowing Border
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    ctx.strokeRect(screenX, screenY, screenW, screenH);

    // Corner Accents
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(screenX, screenY, 4, 4);
    ctx.fillRect(screenX + screenW - 4, screenY, 4, 4);
    ctx.fillRect(screenX, screenY + screenH - 4, 4, 4);
    ctx.fillRect(screenX + screenW - 4, screenY + screenH - 4, 4, 4);

    // Zone Badge
    const zoneBadge = `ZONE [${coords.zx},${coords.zy}]`;
    drawText8x8(zoneBadge, screenX + 4, screenY + 4, "#ffd700", 1);
  }

  // Floating Territory Banner on Top HUD area
  const bannerText = `TERRITORY: ${(g.name || "CLAN").toUpperCase()}`;
  const bannerW = bannerText.length * 8 + 80;
  const bannerX = Math.floor((CANVAS_WIDTH - bannerW) / 2);
  const bannerY = 38;

  drawNESBox(bannerX, bannerY, bannerW, 26);
  drawText8x8(bannerText, bannerX + 8, bannerY + 9, "#ffd700", 1);

  drawNESButton(bannerX + bannerW - 55, bannerY + 3, 50, 20, "HIDE", false, true);
  registerClickableRegion(bannerX + bannerW - 55, bannerY + 3, 50, 20, () => {
    visualizedGroupId = null;
  });

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 5. In-Engine Modal 4: World Event Log Explorer Screen ([L])
// ---------------------------------------------------------------------------

function getFilteredLogs() {
  const events = allEvents.slice().reverse();
  if (logFilter === "ALL") return events;
  return events.filter(e => e.type === logFilter);
}

function renderLogsModal() {
  const mx = 40;
  const my = 40;
  const mw = CANVAS_WIDTH - 80;
  const mh = CANVAS_HEIGHT - 86;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
  ctx.fillRect(0, 32, CANVAS_WIDTH, CANVAS_HEIGHT - 68);

  drawNESBox(mx, my, mw, mh);

  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    if (inspectingLogEvent) inspectingLogEvent = null;
    else currentMode = "MAP";
  });

  // If viewing a specific event detail:
  if (inspectingLogEvent) {
    renderLogDetailView(mx, my, mw, mh, inspectingLogEvent);
    ctx.restore();
    return;
  }

  const list = getFilteredLogs();
  drawText8x8(`WORLD LOG (${list.length}) - CLICK EVENT TO INSPECT`, mx + 16, my + 14, "#f8b800", 1);

  // Export Button in Logs Header
  drawNESButton(mx + mw - 170, my + 8, 155, 22, "EXPORT CHRONICLE", false, false);
  registerClickableRegion(mx + mw - 170, my + 8, 155, 22, () => {
    downloadChronicleJSON(world, entities, currentTick, entityRegistry);
  });

  // Filter Buttons
  const filters = ["ALL", "KILL", "ATTACK", "RELATION", "DIALOGUE", "AMPUTATION", "BIRTH", "DEATH", "SPROUT", "MINE", "BUILD"];
  let fx = mx + 16;
  for (const f of filters) {
    const isAct = logFilter === f;
    const fw = f.length * 8 + 12;
    drawNESButton(fx, my + 36, fw, 22, f, isAct, false);
    registerClickableRegion(fx, my + 36, fw, 22, () => {
      logFilter = f;
      modalScroll = 0;
    });
    fx += fw + 4;
  }

  // Event List Box
  const tableY = my + 64;
  const tableH = mh - 74;
  drawNESBox(mx + 10, tableY, mw - 20, tableH);

  const rowH = 20;
  const visibleRows = Math.floor((tableH - 16) / rowH);
  const maxScroll = Math.max(0, list.length - visibleRows);
  modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

  let rowY = tableY + 16;
  for (let i = modalScroll; i < Math.min(list.length, modalScroll + visibleRows); i++) {
    const ev = list[i];
    const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= rowY - 4 && mouseY <= rowY + 16;

    if (isHover) {
      ctx.fillStyle = "#181828";
      ctx.fillRect(mx + 12, rowY - 4, mw - 24, rowH);
    }

    const ts = ev.timestamp ? `D${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2,"0")}:${String(ev.timestamp.minute).padStart(2,"0")}` : `T${ev.tick}`;
    drawText8x8(ts, mx + 18, rowY + 2, "#bcbcbc", 1);

    const typeColor = ev.type === "KILL" ? "#ff2040" : ev.type === "DEATH" ? "#9c5050" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#e40058" : ev.type === "RELATION" ? "#d3869b" : ev.type === "DIALOGUE" ? "#3cbcfc" : ev.type === "BIRTH" ? "#f8b800" : ev.type === "SPROUT" ? "#58d854" : "#ffffff";
    drawText8x8(`[${ev.type}]`, mx + 115, rowY + 2, typeColor, 1);

    const locStr = ev.location ? `[${ev.location.x},${ev.location.y}] ` : "";
    const shortDesc = `${locStr}${ev.description}`.slice(0, 52).toUpperCase();
    drawText8x8(shortDesc, mx + 235, rowY + 2, "#ffffff", 1);

    // Detail click
    const curEv = ev;
    registerClickableRegion(mx + 12, rowY - 4, mw - 24, rowH, () => {
      inspectingLogEvent = curEv;
    });

    rowY += rowH;
  }

  ctx.restore();
}

function renderLogDetailView(mx, my, mw, mh, ev) {
  const typeColor = ev.type === "KILL" ? "#ff2040" : ev.type === "DEATH" ? "#9c5050" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#e40058" : ev.type === "RELATION" ? "#d3869b" : ev.type === "DIALOGUE" ? "#3cbcfc" : ev.type === "BIRTH" ? "#f8b800" : ev.type === "LIE" ? "#fa5078" : ev.type === "SPROUT" ? "#58d854" : "#ffffff";

  drawText8x8(`EVENT DETAIL (#${ev.id})`, mx + 16, my + 14, "#f8b800", 1);

  const isLie = ev.opcode === 18 || ev.type === "LIE" || !!ev.metadata?.isLie;
  if (isLie) {
    drawText8x8("[FABRICATED LIE 🤥]", mx + 240, my + 14, "#fa5078", 1);
  }

  // Detail Container Box
  drawNESBox(mx + 14, my + 38, mw - 28, mh - 50);

  drawText8x8(`EVENT TYPE: [${ev.type}]`, mx + 30, my + 56, typeColor, 1);

  const ts = ev.timestamp ? `DAY ${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2,"0")}:${String(ev.timestamp.minute).padStart(2,"0")}` : `TICK ${ev.tick}`;
  drawText8x8(`TIME: ${ts}`, mx + 30, my + 76, "#ffffff", 1);

  if (ev.location) {
    drawText8x8(`COORDINATES: [X: ${ev.location.x}, Y: ${ev.location.y}]`, mx + 30, my + 96, "#bcbcbc", 1);
  }

  let entButtonX = mx + 30;
  if (ev.primaryEntityId !== null && ev.primaryEntityId !== undefined) {
    const pEnt = entityRegistry.get(ev.primaryEntityId);
    const pName = (pEnt?.properties?.name || `Entity #${ev.primaryEntityId}`).slice(0, 16);
    drawNESButton(entButtonX, my + 114, 200, 22, `ACTOR: ${pName.toUpperCase()}`, false, false);
    registerClickableRegion(entButtonX, my + 114, 200, 22, () => {
      lastSelectedId = ev.primaryEntityId;
      currentMode = "INSPECT";
      inspectingLogEvent = null;
    });
    entButtonX += 210;
  }

  if (ev.secondaryEntityId !== null && ev.secondaryEntityId !== undefined) {
    const sEnt = entityRegistry.get(ev.secondaryEntityId);
    const sName = (sEnt?.properties?.name || `Entity #${ev.secondaryEntityId}`).slice(0, 16);
    drawNESButton(entButtonX, my + 114, 200, 22, `TARGET: ${sName.toUpperCase()}`, false, false);
    registerClickableRegion(entButtonX, my + 114, 200, 22, () => {
      lastSelectedId = ev.secondaryEntityId;
      currentMode = "INSPECT";
      inspectingLogEvent = null;
    });
    entButtonX += 210;
  }

  // Linked / Cited Event Button
  const citedId = ev.metadata?.referencedEventId || ev.metadata?.gossipedEventId || ev.metadata?.realEventId || ev.metadata?.citedEventId;
  if (citedId) {
    const citedEv = getEventById(citedId);
    const citedLabel = isLie ? `ORIGINAL TRUTH #${citedId}` : `GOSSIP TOPIC #${citedId}`;
    drawNESButton(entButtonX, my + 114, 210, 22, citedLabel, false, false);
    registerClickableRegion(entButtonX, my + 114, 210, 22, () => {
      if (citedEv) {
        inspectingLogEvent = citedEv;
      }
    });
  }

  // Citations / Chronicles List
  const citations = getCitationsForEvent(ev.id, 4);
  const hasCitations = citations.length > 0;
  const narrativeBoxH = hasCitations ? mh - 310 : mh - 230;

  // Full Unwrapped Narrative Box
  drawNESBox(mx + 30, my + 145, mw - 60, narrativeBoxH);
  drawText8x8("FULL NARRATIVE LOG:", mx + 42, my + 158, "#f8b800", 1);

  const maxCharsPerLine = Math.floor((mw - 84) / 8);
  const wrappedLines = wrapText8x8((ev.description || "NO DESCRIPTION RECORDED.").toUpperCase(), maxCharsPerLine);
  let narrativeY = my + 176;

  for (const wline of wrappedLines) {
    if (narrativeY > my + 145 + narrativeBoxH - 16) break;
    drawText8x8(wline, mx + 42, narrativeY, "#ffffff", 1);
    narrativeY += 14;
  }

  // Citations Box
  if (hasCitations) {
    const citeBoxY = my + 145 + narrativeBoxH + 10;
    const citeBoxH = 72;
    drawNESBox(mx + 30, citeBoxY, mw - 60, citeBoxH);
    drawText8x8(`CITATIONS & CHRONICLES (${citations.length}):`, mx + 42, citeBoxY + 8, "#f8b800", 1);

    let curCiteY = citeBoxY + 24;
    for (let i = 0; i < citations.length; i++) {
      const cev = citations[i];
      const ts = cev.timestamp ? `D${cev.timestamp.day} ${String(cev.timestamp.hour).padStart(2,"0")}:${String(cev.timestamp.minute).padStart(2,"0")}` : `T${cev.tick}`;
      const cTypeCol = cev.type === "LIE" ? "#fa5078" : cev.type === "KILL" ? "#ff2040" : cev.type === "DIALOGUE" ? "#3cbcfc" : "#f8b800";
      drawText8x8(`${ts} [${cev.type}]`, mx + 42, curCiteY + 4, cTypeCol, 1);

      const cdesc = (cev.description || "Event").slice(0, 44).toUpperCase();
      drawText8x8(cdesc, mx + 175, curCiteY + 4, "#bcbcbc", 1);

      const curCev = cev;
      drawNESButton(mx + mw - 140, curCiteY, 90, 18, "INSPECT", false, false);
      registerClickableRegion(mx + mw - 140, curCiteY, 90, 18, () => {
        inspectingLogEvent = curCev;
      });

      curCiteY += 22;
      if (curCiteY > citeBoxY + citeBoxH - 18) break;
    }
  }

  // Action Buttons inside Detail view
  if (ev.location) {
    drawNESButton(mx + 30, my + mh - 70, 200, 30, "JUMP TO LOCATION", false, false);
    registerClickableRegion(mx + 30, my + mh - 70, 200, 30, () => {
      if (shader) {
        shader.exports.wasm_set_camera(ev.location.x, ev.location.y, shader.exports.wasm_get_camera_zoom());
        currentMode = "MAP";
      }
    });
  }

  const backLabel = inspectingFromCreature ? "BACK TO CREATURE" : ((currentMode === "GROUPS" || inspectingGroup) ? "BACK TO CLAN" : "BACK TO LOGS");
  drawNESButton(mx + mw - 190, my + mh - 70, 160, 30, backLabel, false, false);
  registerClickableRegion(mx + mw - 190, my + mh - 70, 160, 30, () => {
    inspectingLogEvent = null;
    if (inspectingFromCreature) {
      currentMode = "INSPECT";
      inspectingFromCreature = false;
    }
  });
}

// ---------------------------------------------------------------------------
// 6. In-Engine Modal 5: Real-Time Map & World Editor ([S])
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 6. Real-Time Floating Corner Map & World Editor Bar ([S])
// ---------------------------------------------------------------------------

function renderCompactEditorPanel() {
  if (!isEditorOpen || currentMode !== "MAP") return;

  const pw = 216;
  const ph = 380;
  const px = CANVAS_WIDTH - pw - 10;
  const py = 36;

  ctx.save();
  ctx.fillStyle = "rgba(10, 10, 18, 0.94)";
  ctx.fillRect(px, py, pw, ph);

  ctx.strokeStyle = "#f8b800";
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);

  // Header Title & Close Button
  drawText8x8("MAP EDITOR", px + 8, py + 10, "#f8b800", 1);
  drawNESButton(px + pw - 20, py + 5, 15, 15, "X", false, true);
  registerClickableRegion(px + pw - 20, py + 5, 15, 15, () => {
    isEditorOpen = false;
    editorTool = null;
    editorActiveSpawner = null;
    isPainting = false;
  });

  // Mini Category Tabs: [TILE] [MOB] [ITEM] [TOOL]
  const tabs = [
    { id: "TILES", label: "TILE", w: 46 },
    { id: "CREATURES", label: "MOB", w: 44 },
    { id: "ITEMS", label: "ITEM", w: 46 },
    { id: "TOOLS", label: "TOOL", w: 46 }
  ];

  let tabX = px + 8;
  for (const t of tabs) {
    const isAct = editorTab === t.id;
    drawNESButton(tabX, py + 26, t.w, 20, t.label, isAct, false);
    const tabId = t.id;
    registerClickableRegion(tabX, py + 26, t.w, 20, () => {
      editorTab = tabId;
      editorPage = 0;
    });
    tabX += t.w + 4;
  }

  const contentY = py + 52;

  // TAB 1: TILES
  if (editorTab === "TILES") {
    drawText8x8("TERRAIN TILES:", px + 8, contentY, "#3cbcfc", 1);

    const cols = 2;
    const colW = Math.floor((pw - 20) / cols);
    const itemH = 24;

    for (let i = 0; i < EDITOR_TILES.length; i++) {
      const tile = EDITOR_TILES[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = px + 8 + col * (colW + 4);
      const by = contentY + 12 + row * (itemH + 4);
      const isSel = editorTool === "PAINT" && editorSelectedTile === tile.id;

      drawNESButton(bx, by, colW, itemH, ` ${tile.label.slice(0, 7)}`, isSel, false);

      // Mini Color Swatch
      ctx.fillStyle = tile.color;
      ctx.fillRect(bx + 4, by + 6, 10, 10);
      ctx.strokeStyle = "#ffffff";
      ctx.strokeRect(bx + 4, by + 6, 10, 10);

      const tileId = tile.id;
      registerClickableRegion(bx, by, colW, itemH, () => {
        editorSelectedTile = tileId;
        editorTool = "PAINT";
        editorActiveSpawner = null;
      });
    }

    // Brush Sizes
    const brushY = contentY + 104;
    drawText8x8("BRUSH RADIUS:", px + 8, brushY, "#f8b800", 1);
    const sizes = [1, 3, 5, 9];
    let bsizeX = px + 8;
    const bsizeW = Math.floor((pw - 20 - 12) / 4);
    for (const sz of sizes) {
      const isAct = editorBrushSize === sz;
      drawNESButton(bsizeX, brushY + 12, bsizeW, 20, `${sz}x${sz}`, isAct, false);
      const sizeVal = sz;
      registerClickableRegion(bsizeX, brushY + 12, bsizeW, 20, () => {
        editorBrushSize = sizeVal;
        editorTool = "PAINT";
      });
      bsizeX += bsizeW + 4;
    }

    // Fill Viewport Button
    drawNESButton(px + 8, brushY + 38, pw - 16, 22, "FILL VIEWPORT AREA", false, false);
    registerClickableRegion(px + 8, brushY + 38, pw - 16, 22, () => {
      if (shader && world) {
        const cx = Math.floor(shader.exports.wasm_get_camera_x());
        const cy = Math.floor(shader.exports.wasm_get_camera_y());
        applyTileBrush(cx, cy, editorSelectedTile, 30);
      }
    });
  }

  // TAB 2: CREATURES (Paginated: 8 per page)
  else if (editorTab === "CREATURES") {
    const itemsPerPage = 8;
    const maxPages = Math.ceil(EDITOR_CREATURES.length / itemsPerPage);
    drawText8x8(`SPAWN MOB (P.${editorPage + 1}/${maxPages}):`, px + 8, contentY, "#3cbcfc", 1);

    const cols = 2;
    const colW = Math.floor((pw - 20) / cols);
    const itemH = 24;

    const startIdx = editorPage * itemsPerPage;
    const pageItems = EDITOR_CREATURES.slice(startIdx, startIdx + itemsPerPage);

    for (let i = 0; i < pageItems.length; i++) {
      const c = pageItems[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = px + 8 + col * (colW + 4);
      const by = contentY + 12 + row * (itemH + 4);
      const isSel = editorTool === "SPAWN" && editorActiveSpawner?.label === c.label;

      drawNESButton(bx, by, colW, itemH, `+${c.label.slice(0, 8)}`, isSel, false);

      const spawnerObj = c;
      registerClickableRegion(bx, by, colW, itemH, () => {
        editorActiveSpawner = spawnerObj;
        editorTool = "SPAWN";
      });
    }

    // Pagination buttons
    const pageY = contentY + 128;
    drawNESButton(px + 8, pageY, 90, 20, "◀ PREV", false, false);
    registerClickableRegion(px + 8, pageY, 90, 20, () => {
      editorPage = (editorPage - 1 + maxPages) % maxPages;
    });

    drawNESButton(px + pw - 98, pageY, 90, 20, "NEXT ▶", false, false);
    registerClickableRegion(px + pw - 98, pageY, 90, 20, () => {
      editorPage = (editorPage + 1) % maxPages;
    });
  }

  // TAB 3: NATURE & ITEMS (Paginated)
  else if (editorTab === "ITEMS") {
    const itemsPerPage = 8;
    const maxPages = Math.ceil(EDITOR_ITEMS.length / itemsPerPage);
    drawText8x8(`ITEMS/NATURE (P.${editorPage + 1}/${maxPages}):`, px + 8, contentY, "#3cbcfc", 1);

    const cols = 2;
    const colW = Math.floor((pw - 20) / cols);
    const itemH = 24;

    const startIdx = editorPage * itemsPerPage;
    const pageItems = EDITOR_ITEMS.slice(startIdx, startIdx + itemsPerPage);

    for (let i = 0; i < pageItems.length; i++) {
      const it = pageItems[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = px + 8 + col * (colW + 4);
      const by = contentY + 12 + row * (itemH + 4);
      const isSel = editorTool === "SPAWN" && editorActiveSpawner?.label === it.label;

      drawNESButton(bx, by, colW, itemH, `+${it.label.slice(0, 8)}`, isSel, false);

      const spawnerObj = it;
      registerClickableRegion(bx, by, colW, itemH, () => {
        editorActiveSpawner = spawnerObj;
        editorTool = "SPAWN";
      });
    }

    // Pagination buttons
    const pageY = contentY + 128;
    drawNESButton(px + 8, pageY, 90, 20, "◀ PREV", false, false);
    registerClickableRegion(px + 8, pageY, 90, 20, () => {
      editorPage = (editorPage - 1 + maxPages) % maxPages;
    });

    drawNESButton(px + pw - 98, pageY, 90, 20, "NEXT ▶", false, false);
    registerClickableRegion(px + pw - 98, pageY, 90, 20, () => {
      editorPage = (editorPage + 1) % maxPages;
    });
  }

  // TAB 4: TOOLS
  else if (editorTab === "TOOLS") {
    drawText8x8("MAP TOOLS:", px + 8, contentY, "#3cbcfc", 1);

    const tools = [
      { id: "PAINT", label: "TERRAIN BRUSH" },
      { id: "EYEDROPPER", label: "EYEDROPPER" },
      { id: "BULLDOZER", label: "BULLDOZER (DEL)" }
    ];

    let toolY = contentY + 12;
    for (const t of tools) {
      const isAct = editorTool === t.id;
      drawNESButton(px + 8, toolY, pw - 16, 26, t.label, isAct, t.id === "BULLDOZER");

      const toolId = t.id;
      registerClickableRegion(px + 8, toolY, pw - 16, 26, () => {
        editorTool = toolId;
        if (toolId !== "SPAWN") editorActiveSpawner = null;
      });

      toolY += 32;
    }
  }

  // Bottom Quick Status & Instructions
  const footerY = py + ph - 54;
  ctx.fillStyle = "#181824";
  ctx.fillRect(px + 8, footerY, pw - 16, 44);
  ctx.strokeStyle = "#444458";
  ctx.strokeRect(px + 8, footerY, pw - 16, 44);

  let activeStr = "NONE";
  if (editorTool === "PAINT") activeStr = `TILE: ${EDITOR_TILES[editorSelectedTile]?.label.slice(0, 8)}`;
  else if (editorTool === "SPAWN") activeStr = `MOB: ${editorActiveSpawner?.label.slice(0, 9)}`;
  else if (editorTool === "BULLDOZER") activeStr = "BULLDOZER";
  else if (editorTool === "EYEDROPPER") activeStr = "EYEDROPPER";

  drawText8x8(`ACTIVE: ${activeStr}`, px + 12, footerY + 6, "#f8b800", 1);
  drawText8x8("L-CLICK MAP: APPLY", px + 12, footerY + 20, "#58d854", 1);
  drawText8x8("R-CLICK: PAN | ESC: EXIT", px + 12, footerY + 32, "#bcbcbc", 1);

  ctx.restore();
}

function renderMapEditorOverlay() {
  if (!shader || !world || !isEditorOpen || !editorTool || currentMode !== "MAP") return;

  const zoom = shader.exports.wasm_get_camera_zoom();
  const tileSize = 16.0 * zoom;
  const cx = shader.exports.wasm_get_camera_x();
  const cy = shader.exports.wasm_get_camera_y();
  const hoverTileX = Math.floor(cx + (mouseX - CANVAS_WIDTH / 2) / tileSize);
  const hoverTileY = Math.floor(cy + (mouseY - CANVAS_HEIGHT / 2) / tileSize);

  const panelX = CANVAS_WIDTH - 226;
  const isOverPanel = mouseX >= panelX && mouseY >= 36 && mouseY <= 420;

  // If hovering over active map area and not over the docked corner panel
  if (!isOverPanel && mouseY > 32 && mouseY < CANVAS_HEIGHT - 36 && mouseX >= 0 && mouseX <= CANVAS_WIDTH) {
    const centerScreenX = CANVAS_WIDTH / 2;
    const centerScreenY = CANVAS_HEIGHT / 2;

    if (editorTool === "PAINT") {
      const half = Math.floor(editorBrushSize / 2);
      const startX = centerScreenX + (hoverTileX - half - cx) * tileSize;
      const startY = centerScreenY + (hoverTileY - half - cy) * tileSize;
      const boxSize = editorBrushSize * tileSize;

      ctx.save();
      ctx.strokeStyle = EDITOR_TILES[editorSelectedTile]?.color || "#f8b800";
      ctx.lineWidth = 2;
      ctx.strokeRect(startX, startY, boxSize, boxSize);

      ctx.fillStyle = (EDITOR_TILES[editorSelectedTile]?.color || "#f8b800") + "44";
      ctx.fillRect(startX, startY, boxSize, boxSize);
      ctx.restore();
    } else if (editorTool === "SPAWN" && editorActiveSpawner) {
      const startX = centerScreenX + (hoverTileX - cx) * tileSize;
      const startY = centerScreenY + (hoverTileY - cy) * tileSize;

      ctx.save();
      ctx.strokeStyle = "#58d854";
      ctx.lineWidth = 2;
      ctx.strokeRect(startX, startY, tileSize, tileSize);
      drawText8x8(`SPAWN: ${editorActiveSpawner.label}`, Math.min(CANVAS_WIDTH - 230, mouseX + 12), Math.max(48, mouseY - 14), "#58d854", 1);
      ctx.restore();
    } else if (editorTool === "BULLDOZER") {
      const startX = centerScreenX + (hoverTileX - cx) * tileSize;
      const startY = centerScreenY + (hoverTileY - cy) * tileSize;

      ctx.save();
      ctx.strokeStyle = "#e40058";
      ctx.lineWidth = 2;
      ctx.strokeRect(startX, startY, tileSize, tileSize);
      drawText8x8("ERASE / BULLDOZE", Math.min(CANVAS_WIDTH - 230, mouseX + 12), Math.max(48, mouseY - 14), "#e40058", 1);
      ctx.restore();
    } else if (editorTool === "EYEDROPPER") {
      const startX = centerScreenX + (hoverTileX - cx) * tileSize;
      const startY = centerScreenY + (hoverTileY - cy) * tileSize;

      ctx.save();
      ctx.strokeStyle = "#3cbcfc";
      ctx.lineWidth = 2;
      ctx.strokeRect(startX, startY, tileSize, tileSize);
      drawText8x8("SAMPLE TILE", Math.min(CANVAS_WIDTH - 230, mouseX + 12), Math.max(48, mouseY - 14), "#3cbcfc", 1);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Hover In-Game Floating Creature Tooltip (8x8 Font)
// ---------------------------------------------------------------------------

function renderHoverTooltip() {
  if (currentMode !== "MAP" || !shader || !world) return;

  const zoom = shader.exports.wasm_get_camera_zoom();
  const tileSize = 16.0 * zoom;
  const cx = shader.exports.wasm_get_camera_x();
  const cy = shader.exports.wasm_get_camera_y();
  const hoverTileX = Math.floor(cx + (mouseX - CANVAS_WIDTH / 2) / tileSize);
  const hoverTileY = Math.floor(cy + (mouseY - CANVAS_HEIGHT / 2) / tileSize);

  const hoveredEnt = entities.find(e => !e.destroyed && e.x === hoverTileX && e.y === hoverTileY);
  if (!hoveredEnt) return;

  const tw = 180;
  const th = 56;
  const tx = Math.min(CANVAS_WIDTH - tw - 12, mouseX + 16);
  const ty = Math.min(CANVAS_HEIGHT - th - 44, mouseY + 16);

  drawNESBox(tx, ty, tw, th);

  ctx.save();
  drawText8x8((hoveredEnt.properties.name || "ENTITY").slice(0, 18).toUpperCase(), tx + 8, ty + 10, "#f8b800", 1);
  drawText8x8(`SP:${(hoveredEnt.properties.species || "-").toUpperCase()}`, tx + 8, ty + 24, "#ffffff", 1);

  if (hoveredEnt.properties.life) {
    drawNESProgressBar(tx + 8, ty + 36, tw - 16, 12, hoveredEnt.properties.life.energy, hoveredEnt.properties.life.max || 100, "HP", "#58d854");
  } else {
    drawText8x8("ITEM / RESOURCE", tx + 8, ty + 38, "#3cbcfc", 1);
  }
  ctx.restore();
}

/**
 * Renders authentic creature perception vision ("Ver pelos olhos da criatura"):
 * - Active perception range: 100% full vibrant color
 * - Explored / Known zones: dimmed dark fog-of-war
 * - Unexplored / Unknown zones: pitch black
 */
function renderCreatureVisionOverlay() {
  if (currentMode !== "MAP" || !shader || !world || !isCreatureVisionMode || lastSelectedId <= 0) return;
  const target = getEntityById(lastSelectedId);
  if (!target || target.destroyed) {
    isCreatureVisionMode = false;
    return;
  }

  const zoom = shader.exports.wasm_get_camera_zoom();
  const tileSize = 16.0 * zoom;
  const camX = shader.exports.wasm_get_camera_x();
  const camY = shader.exports.wasm_get_camera_y();
  const centerScreenX = CANVAS_WIDTH / 2;
  const centerScreenY = CANVAS_HEIGHT / 2;

  const viewRange = target.properties.eye_left?.viewRange || target.properties.eye_right?.viewRange || 8;
  const creatureScreenX = centerScreenX + (target.x - camX) * tileSize + tileSize / 2;
  const creatureScreenY = centerScreenY + (target.y - camY) * tileSize + tileSize / 2;
  const visionRadiusPx = (viewRange + 0.6) * tileSize;

  // Build creature's known macro-zone keys (8x8 chunks)
  const knownZones = new Set();
  if (target.properties.brain?.geoMemory) {
    for (const k of Object.keys(target.properties.brain.geoMemory)) {
      knownZones.add(k);
    }
  }
  if (target.properties.group?.claimedZones) {
    for (const zk of target.properties.group.claimedZones) {
      const parts = zk.includes("_") ? zk.split("_") : zk.split(",");
      knownZones.add(`${parts[0]}_${parts[1]}`);
    }
  }
  // Current zone is always known
  knownZones.add(`${Math.floor(target.x / 8)}_${Math.floor(target.y / 8)}`);

  const minTx = Math.floor(camX - (centerScreenX / tileSize) - 1);
  const maxTx = Math.ceil(camX + (centerScreenX / tileSize) + 1);
  const minTy = Math.floor(camY - (centerScreenY / tileSize) - 1);
  const maxTy = Math.ceil(camY + (centerScreenY / tileSize) + 1);

  const minZx = Math.floor(minTx / 8);
  const maxZx = Math.floor(maxTx / 8);
  const minZy = Math.floor(minTy / 8);
  const maxZy = Math.floor(maxTy / 8);

  ctx.save();

  // Create clipping region for everything strictly OUTSIDE the creature's perception circle
  ctx.beginPath();
  ctx.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.arc(creatureScreenX, creatureScreenY, visionRadiusPx, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();

  // 1. Draw solid pitch black on unknown zones and dark translucent on known zones (only outside perception radius)
  for (let zy = minZy; zy <= maxZy; zy++) {
    for (let zx = minZx; zx <= maxZx; zx++) {
      const zk = `${zx}_${zy}`;
      const screenX = centerScreenX + (zx * 8 - camX) * tileSize;
      const screenY = centerScreenY + (zy * 8 - camY) * tileSize;
      const screenW = 8 * tileSize;
      const screenH = 8 * tileSize;

      const isKnown = knownZones.has(zk);
      if (isKnown) {
        // Known zone: darker / dimmed (fog-of-war memory)
        ctx.fillStyle = "rgba(0, 0, 0, 0.70)";
        ctx.fillRect(screenX, screenY, screenW, screenH);
      } else {
        // Unknown zone: completely pitch black
        ctx.fillStyle = "#000000";
        ctx.fillRect(screenX, screenY, screenW, screenH);
      }
    }
  }

  ctx.restore();

  // 2. Subtle soft perception perimeter ring
  ctx.save();
  ctx.strokeStyle = "rgba(255, 215, 0, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(creatureScreenX, creatureScreenY, visionRadiusPx, 0, Math.PI * 2);
  ctx.stroke();

  // Badge on screen
  const badge = `[VISION: ${(target.properties.name || "CREATURE").toUpperCase()} (RANGE: ${viewRange})]`;
  drawText8x8(badge, 8, CANVAS_HEIGHT - 48, "#ffd700", 1);
  ctx.restore();
}

/**
 * Compact HUD Box with Summary Info and Quick Toggles for Selected Creature
 */
function renderCreatureSummaryBox() {
  if (currentMode !== "MAP" || lastSelectedId <= 0) return;
  const ent = getEntityById(lastSelectedId);
  if (!ent || ent.destroyed) return;

  const bx = 8;
  const by = 38;
  const bw = 240;
  const bh = 82;

  drawNESBox(bx, by, bw, bh);
  // Absorb clicks on summary box background so world selection is not triggered behind the HUD
  registerClickableRegion(bx, by, bw, bh, () => {});

  const nameStr = (ent.properties.name || `Entity #${ent.id}`).slice(0, 18).toUpperCase();
  drawText8x8(nameStr, bx + 8, by + 8, "#f8b800", 1);

  const speciesStr = (ent.properties.species || "Creature").toUpperCase();
  const clanStr = (ent.properties.group?.name || "Solitary").slice(0, 10).toUpperCase();
  drawText8x8(`${speciesStr} | ${clanStr}`, bx + 8, by + 20, "#3cbcfc", 1);

  if (ent.properties.life) {
    drawNESProgressBar(bx + 8, by + 32, bw - 16, 12, ent.properties.life.energy, ent.properties.life.max || 100, "HP", "#58d854");
  }

  // Toggles for Follow & Vision
  const followTxt = isFollowMode ? "FOLLOW:ON" : "FOLLOW:OFF";
  drawNESButton(bx + 8, by + 50, 108, 24, followTxt, isFollowMode, false);
  registerClickableRegion(bx + 8, by + 50, 108, 24, () => {
    isFollowMode = !isFollowMode;
  });

  const visionTxt = isCreatureVisionMode ? "VISION:ON" : "VISION:OFF";
  drawNESButton(bx + 124, by + 50, 108, 24, visionTxt, isCreatureVisionMode, false);
  registerClickableRegion(bx + 124, by + 50, 108, 24, () => {
    isCreatureVisionMode = !isCreatureVisionMode;
  });
}

/**
 * Bottom-Right Quadrant HUD Panel: Real-time specific Event Log for Selected Creature (No Coordinates)
 */
function renderCreatureEventLogPanel() {
  if (currentMode !== "MAP" || lastSelectedId <= 0 || inspectingLogEvent) return;
  const ent = getEntityById(lastSelectedId);
  if (!ent || ent.destroyed) return;

  const px = CANVAS_WIDTH - 386;
  const py = CANVAS_HEIGHT - 176;
  const pw = 378;
  const ph = 140;

  drawNESBox(px, py, pw, ph);
  // Absorb clicks so they don't click through to map
  registerClickableRegion(px, py, pw, ph, () => {});

  const nameStr = (ent.properties.name || `Entity #${ent.id}`).toUpperCase().slice(0, 16);
  drawText8x8(`* CHRONICLE: ${nameStr}`, px + 8, py + 8, "#ffd700", 1);

  // Full Log Button
  drawNESButton(px + pw - 88, py + 4, 80, 18, "FULL LOG", false, false);
  registerClickableRegion(px + pw - 88, py + 4, 80, 18, () => {
    inspectingFromCreature = "MAP";
    currentMode = "INSPECT";
    dossierTab = "CHRONICLE";
  });

  const creatureEvents = getEventsForEntity(ent.id, 5);
  if (creatureEvents.length === 0) {
    drawText8x8("NO HISTORICAL EVENTS RECORDED YET.", px + 10, py + 36, "#888888", 1);
    return;
  }

  let rowY = py + 26;
  for (let i = 0; i < creatureEvents.length; i++) {
    const ev = creatureEvents[i];
    const isHover = mouseX >= px + 6 && mouseX <= px + pw - 6 && mouseY >= rowY - 2 && mouseY <= rowY + 18;
    if (isHover) {
      ctx.fillStyle = "#202034";
      ctx.fillRect(px + 6, rowY - 2, pw - 12, 20);
    }

    const isLie = ev.opcode === 18 || ev.type === "LIE";
    const typeCol = isLie ? "#fa5078" : ev.type === "DEATH" ? "#f83800" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#d3869b" : ev.type === "BIRTH" ? "#58d854" : ev.type === "RELATION" ? "#f878f8" : "#3cbcfc";
    const typeBadge = isLie ? "[LIE]" : `[${ev.type.slice(0, 4)}]`;

    // Strip location string coordinates (e.g. [X: 12, Y: 34] or [12,34]) as player is following creature
    const cleanDesc = (ev.description || "")
      .replace(/\s*\[X:\s*-?\d+,\s*Y:\s*-?\d+\]/gi, "")
      .replace(/\s*\[-?\d+,\s*-?\d+\]/gi, "")
      .trim()
      .toUpperCase();

    const maxChars = Math.floor((pw - 62) / 8);
    const shortDesc = cleanDesc.length > maxChars ? cleanDesc.slice(0, maxChars - 3) + "..." : cleanDesc;

    drawText8x8(typeBadge, px + 8, rowY + 2, typeCol, 1);
    drawText8x8(shortDesc, px + 54, rowY + 2, "#ffffff", 1);

    const curEv = ev;
    registerClickableRegion(px + 6, rowY - 2, pw - 12, 20, () => {
      inspectingLogEvent = curEv;
      inspectingFromCreature = "MAP";
    });

    rowY += 22;
  }
}

// ---------------------------------------------------------------------------
// Main Animation Frame Loop
// ---------------------------------------------------------------------------

function frame(time) {
  const dt = lastTime > 0 ? (time - lastTime) * 0.001 : 0.016;
  lastTime = time;

  // FPS Counter
  fpsFrames++;
  if (time - lastFpsUpdate >= 1000) {
    currentFps = fpsFrames;
    fpsFrames = 0;
    lastFpsUpdate = time;
  }

  handleCameraKeys(dt);
  activeUiRegions = [];

  // Automatic Camera Tracking / Follow Mode
  if (isFollowMode && lastSelectedId > 0 && shader) {
    const target = getEntityById(lastSelectedId);
    if (target && !target.destroyed) {
      const curZoom = shader.exports.wasm_get_camera_zoom();
      shader.exports.wasm_set_camera(target.x, target.y, curZoom);
    } else {
      isFollowMode = false;
    }
  }

  if (shader && world) {
    // 1. Tick Simulation if not paused
    if (!isPaused) {
      const effectiveDt = Math.min(dt, 0.1) * simSpeed;
      world.clock.tick(effectiveDt);
      incrementEngineTick();
      tickEntities(entities, effectiveDt, world);
      tpsCounter++;
    }

    if (time - lastTpsUpdate >= 1000) {
      measuredTps = Math.round(tpsCounter * (1000 / Math.max(1, time - lastTpsUpdate)));
      tpsCounter = 0;
      lastTpsUpdate = time;
    }

    // 2. Sync renderable entities into WASM shared memory
    syncRenderToWasm(entities, mem, shader.exports, isCreatureVisionMode ? lastSelectedId : null);

    // 3. Update WASM clock & lighting
    shader.exports.wasm_set_clock(
      world.clock.day,
      world.clock.hour,
      world.clock.minute,
      world.clock.globalLight,
      0.0,
      entities.length
    );

    // 4. Run WASM Pixel Renderer
    shader.exports._start(
      mem.heapBase,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      time * 0.001,
      mouseX,
      mouseY,
      mouseButtons,
      dt
    );

    // 5. Blit rendered pixel buffer to Canvas
    const pixelsU8 = new Uint8Array(mem.buffer, mem.heapBase, FRAMEBUFFER_SIZE);
    imageData.data.set(pixelsU8);
    ctx.putImageData(imageData, 0, 0);

    // 6. Draw Pure In-Engine Canvas UI Overlay using Renderer's 8x8 Font
    renderCreatureVisionOverlay();
    renderTerritoryOverlay();
    renderTopHudBar();
    renderBottomToolbar();
    renderHoverTooltip();
    renderCreatureSummaryBox();
    renderCreatureEventLogPanel();
    renderMapEditorOverlay();
    renderCompactEditorPanel();

    if (inspectingLogEvent) {
      const mx = 30;
      const my = 30;
      const mw = CANVAS_WIDTH - 60;
      const mh = CANVAS_HEIGHT - 60;
      renderLogDetailView(mx, my, mw, mh, inspectingLogEvent);
    } else if (currentMode === "INSPECT") renderDossierModal();
    else if (currentMode === "ENTITIES") renderEntitiesModal();
    else if (currentMode === "GROUPS") renderGroupsModal();
    else if (currentMode === "LOGS") renderLogsModal();
  }

  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Bootloader
// ---------------------------------------------------------------------------

async function init() {
  try {
    shader = await wash_load("./brutopolis.wasm", mem);
    world = new World(mem, shader.exports);
    resetWorld(0);
    console.log("✓ Brutopolis (Pure Canvas Engine with Embedded 8x8 Font) initialized successfully!");
    requestAnimationFrame(frame);
  } catch (err) {
    console.error("Failed to load Brutopolis:", err);
  }
}

init();
