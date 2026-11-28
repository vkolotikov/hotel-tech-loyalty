import level from './assets/level.svg'
import steps from './assets/steps.svg'
import door from './assets/door.svg'
import coin from './assets/coin.svg'
import clock from './assets/clock.svg'
import gift from './assets/gift.svg'
import people from './assets/people.svg'
import boost from './assets/boost.svg'
import ticket from './assets/ticket.svg'
import perk from './assets/perk.svg'
import levelArt from './assets/level-art.svg'
import earnArt from './assets/earn-art.svg'
import rewardArt from './assets/reward-art.svg'
import perkArt from './assets/perk-art.svg'
import offerArt from './assets/offer-art.svg'

/** Original vectors from 01D · Staff settings editors, Figma 392:8135. */
export const editorAssets = { level, steps, door, coin, clock, gift, people, boost, ticket, perk, levelArt, earnArt, rewardArt, perkArt, offerArt }
export type EditorIconName = Exclude<keyof typeof editorAssets, 'levelArt' | 'earnArt' | 'rewardArt' | 'perkArt' | 'offerArt'>
