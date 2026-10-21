/**
 * The emoji the panel's picker offers (spec 2026-10-21 §7.5): a short list of the common ones in eight groups, each with
 * an English name (its button's name for a screen reader) and more words to search by. Searching is in English in every
 * language: a curated list has no names in five languages.
 */
export interface EmojiItem { char: string; name: string; keys: string[] }
export type EmojiGroupId = 'smileys' | 'people' | 'hearts' | 'nature' | 'food' | 'activity' | 'objects' | 'symbols'
export interface EmojiGroup { id: EmojiGroupId; label: string; items: EmojiItem[] }

const e = (char: string, name: string, more = ''): EmojiItem => ({ char, name, keys: `${name} ${more}`.trim().split(/\s+/) })

export const EMOJI_GROUPS: EmojiGroup[] = [
  { id: 'smileys', label: 'Smileys', items: [
    e('😀', 'grinning face', 'smile happy'), e('😃', 'smiley', 'happy joy'), e('😄', 'smiling face', 'happy laugh'), e('😁', 'beaming face', 'grin'),
    e('😆', 'laughing face'), e('😅', 'sweat smile', 'relief phew'), e('😂', 'tears of joy', 'laugh'), e('🤣', 'rolling on the floor laughing', 'rofl'),
    e('😊', 'blushing face', 'smile'), e('😇', 'angel', 'halo innocent'), e('🙂', 'slight smile'), e('😉', 'wink'),
    e('😍', 'heart eyes', 'love'), e('🥰', 'face with hearts', 'adore love'), e('😘', 'kiss'), e('😋', 'yum', 'tasty delicious'),
    e('😎', 'sunglasses', 'cool'), e('🤩', 'star struck', 'excited wow'), e('🥳', 'party face', 'celebrate'), e('🤔', 'thinking face', 'hmm'),
    e('😮', 'surprised face', 'wow'), e('😢', 'crying face', 'sad tear'), e('😴', 'sleeping face', 'tired'), e('🤗', 'hug'),
  ] },
  { id: 'people', label: 'People', items: [
    e('👍', 'thumbs up', 'like yes ok'), e('👎', 'thumbs down', 'dislike no'), e('👏', 'clapping hands', 'applause bravo'), e('🙌', 'raised hands', 'hooray celebrate'),
    e('🙏', 'folded hands', 'pray thanks please'), e('💪', 'flexed biceps', 'muscle strong'), e('👋', 'waving hand', 'hello hi bye'), e('🤝', 'handshake', 'deal agree'),
    e('✌️', 'victory hand', 'peace'), e('🤞', 'fingers crossed', 'luck hope'), e('👌', 'ok hand', 'perfect'), e('👉', 'pointing right'),
    e('👇', 'pointing down'), e('☝️', 'pointing up'), e('✍️', 'writing hand'), e('💅', 'nail polish', 'manicure beauty'),
    e('💇', 'haircut', 'hair salon'), e('💆', 'face massage', 'spa'), e('🧘', 'yoga', 'meditate calm'), e('🏃', 'runner', 'running'),
    e('👀', 'eyes', 'look see'),
  ] },
  { id: 'hearts', label: 'Hearts', items: [
    e('❤️', 'heart', 'love red'), e('🧡', 'orange heart'), e('💛', 'yellow heart'), e('💚', 'green heart'),
    e('💙', 'blue heart'), e('💜', 'purple heart'), e('🖤', 'black heart'), e('🤍', 'white heart'),
    e('🤎', 'brown heart'), e('💕', 'two hearts', 'love'), e('💖', 'sparkling heart'), e('💗', 'growing heart'),
    e('💘', 'heart with arrow', 'cupid'), e('💝', 'heart with ribbon', 'gift'), e('💔', 'broken heart'), e('❣️', 'heart exclamation'),
  ] },
  { id: 'nature', label: 'Nature', items: [
    e('🌸', 'cherry blossom', 'flower spring'), e('🌹', 'rose', 'flower'), e('🌻', 'sunflower', 'flower'), e('🌷', 'tulip', 'flower'),
    e('🌿', 'herb', 'leaf plant'), e('🍀', 'four leaf clover', 'luck'), e('🍁', 'maple leaf', 'autumn fall'), e('🍂', 'fallen leaves', 'autumn fall'),
    e('🌲', 'evergreen tree'), e('🌴', 'palm tree', 'beach'), e('🌞', 'sun with face', 'sunny'), e('☀️', 'sun', 'weather'),
    e('🌙', 'crescent moon', 'night'), e('⭐', 'star'), e('🌈', 'rainbow'), e('❄️', 'snowflake', 'snow winter'),
    e('🔥', 'fire', 'hot lit'), e('💧', 'droplet', 'water'), e('🌊', 'water wave', 'sea ocean'), e('🐶', 'dog', 'puppy'),
    e('🐱', 'cat', 'kitten'), e('🦋', 'butterfly'),
  ] },
  { id: 'food', label: 'Food', items: [
    e('☕', 'coffee', 'hot drink'), e('🍵', 'tea'), e('🍷', 'wine glass'), e('🍾', 'champagne', 'bottle celebrate'),
    e('🥂', 'clinking glasses', 'cheers toast'), e('🍸', 'cocktail', 'martini'), e('🍺', 'beer'), e('🍰', 'shortcake', 'cake dessert'),
    e('🎂', 'birthday cake'), e('🧁', 'cupcake'), e('🍫', 'chocolate bar'), e('🍓', 'strawberry'),
    e('🍋', 'lemon'), e('🍎', 'red apple'), e('🥑', 'avocado'), e('🥗', 'salad', 'healthy'),
    e('🍕', 'pizza'), e('🍔', 'burger', 'hamburger'), e('🍣', 'sushi'), e('🥐', 'croissant', 'breakfast'),
    e('🍽️', 'plate with cutlery', 'dinner restaurant'),
  ] },
  { id: 'activity', label: 'Activities', items: [
    e('🎉', 'party popper', 'celebrate tada'), e('🎊', 'confetti ball', 'celebrate'), e('🎁', 'gift', 'present'), e('🎈', 'balloon'),
    e('🎄', 'christmas tree'), e('🎃', 'pumpkin', 'halloween'), e('🏆', 'trophy', 'win award'), e('🥇', 'gold medal', 'first'),
    e('🎯', 'bullseye', 'target goal'), e('🎵', 'musical note', 'music'), e('🎶', 'musical notes', 'music'), e('🎨', 'artist palette', 'art paint'),
    e('📸', 'camera with flash', 'photo'), e('🎬', 'clapper board', 'film movie'), e('🏋️', 'weight lifter', 'gym'), e('⚽', 'football', 'soccer'),
    e('🎾', 'tennis'), e('🚴', 'cyclist', 'bike cycling'), e('🏊', 'swimmer', 'swim'), e('✈️', 'airplane', 'plane travel flight'),
  ] },
  { id: 'objects', label: 'Objects', items: [
    e('📅', 'calendar', 'date'), e('📆', 'tear-off calendar', 'date'), e('⏰', 'alarm clock', 'time'), e('⌛', 'hourglass', 'time'),
    e('📣', 'megaphone', 'announce'), e('📢', 'loudspeaker', 'announce'), e('💡', 'light bulb', 'idea'), e('📌', 'pushpin', 'pin'),
    e('📍', 'round pushpin', 'location place pin'), e('🔗', 'link', 'chain'), e('📱', 'mobile phone'), e('💻', 'laptop', 'computer'),
    e('✉️', 'envelope', 'email mail'), e('📩', 'envelope with arrow', 'inbox email'), e('🛍️', 'shopping bags'), e('🛒', 'shopping cart'),
    e('💳', 'credit card', 'pay'), e('💰', 'money bag'), e('🏷️', 'label', 'tag price sale'), e('🎟️', 'admission tickets', 'ticket'),
    e('🔑', 'key'), e('🏠', 'house', 'home'), e('🏨', 'hotel'), e('💄', 'lipstick', 'makeup beauty'),
  ] },
  { id: 'symbols', label: 'Symbols', items: [
    e('✅', 'check mark button', 'done yes'), e('✔️', 'check mark', 'tick'), e('❌', 'cross mark', 'no wrong'), e('⚠️', 'warning'),
    e('❗', 'exclamation mark', 'important'), e('❓', 'question mark'), e('💯', 'hundred points', 'perfect'), e('✨', 'sparkles', 'shine new magic'),
    e('⚡', 'high voltage', 'lightning zap fast'), e('💥', 'collision', 'boom'), e('🆕', 'new button'), e('🆓', 'free button'),
    e('🔝', 'top arrow'), e('🔜', 'soon arrow'), e('➡️', 'right arrow'), e('⬇️', 'down arrow'),
    e('⬆️', 'up arrow'), e('🔔', 'bell', 'notification'), e('♻️', 'recycling symbol', 'recycle'), e('💬', 'speech balloon', 'chat comment'),
    e('📈', 'chart increasing', 'growth trend up'), e('🚀', 'rocket', 'launch'),
  ] },
]

export const EMOJI: EmojiItem[] = EMOJI_GROUPS.flatMap(g => g.items)
