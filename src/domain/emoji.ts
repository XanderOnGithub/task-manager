// A small, hand-picked emoji set for page icons, with words to search by.
// Kept short on purpose (no 400 KB emoji database in the app). Any other
// emoji works too: type or paste it in the picker's search box (on a Mac,
// Control-Command-Space opens the system emoji picker).

export interface EmojiGroup {
  label: string
  emoji: [string, string][] // [emoji, search words]
}

export const EMOJI: EmojiGroup[] = [
  {
    label: 'Nature',
    emoji: [
      ['🌿', 'herb leaf moss green plant'], ['🌱', 'seedling sprout grow new'], ['🍃', 'leaves wind'], ['🌳', 'tree'],
      ['🌲', 'evergreen pine tree'], ['🌵', 'cactus desert'], ['🍄', 'mushroom fungus'], ['🪴', 'potted plant'],
      ['🌸', 'blossom flower pink'], ['🌻', 'sunflower'], ['🌷', 'tulip flower'], ['🍂', 'fallen leaves autumn fall'],
      ['🪨', 'rock stone'], ['🌊', 'wave water ocean'], ['⛰️', 'mountain'], ['🏕️', 'camping tent'],
      ['☀️', 'sun sunny'], ['🌙', 'moon night'], ['⭐', 'star'], ['🌈', 'rainbow'],
      ['❄️', 'snow cold winter'], ['🔥', 'fire hot'], ['💧', 'droplet water'], ['⚡', 'lightning energy power'],
      ['🐝', 'bee'], ['🐌', 'snail slow'], ['🦋', 'butterfly'], ['🐸', 'frog'],
      ['🦊', 'fox'], ['🐢', 'turtle slow'], ['🐈', 'cat'], ['🐕', 'dog'],
    ],
  },
  {
    label: 'Home',
    emoji: [
      ['🏠', 'house home'], ['🛋️', 'couch living room'], ['🛏️', 'bed bedroom sleep'], ['🛁', 'bath bathroom'],
      ['🚿', 'shower'], ['🍳', 'cooking kitchen pan'], ['🧹', 'broom cleaning chores'], ['🧺', 'basket laundry'],
      ['🪚', 'saw diy wood'], ['🔨', 'hammer build fix'], ['🔧', 'wrench tool fix'], ['🪛', 'screwdriver'],
      ['🧰', 'toolbox tools'], ['🪣', 'bucket paint'], ['🎨', 'paint art palette'], ['💡', 'idea light bulb'],
      ['🔌', 'plug power electric'], ['🔑', 'key'], ['🚗', 'car'], ['🚲', 'bicycle bike'],
      ['🌡️', 'thermometer temperature'], ['📦', 'package box moving'], ['🗑️', 'trash bin'], ['🪴', 'plant garden'],
    ],
  },
  {
    label: 'Food',
    emoji: [
      ['🍜', 'ramen noodles'], ['🍝', 'pasta spaghetti'], ['🍕', 'pizza'], ['🌮', 'taco'],
      ['🍔', 'burger'], ['🥗', 'salad'], ['🍣', 'sushi'], ['🍛', 'curry rice'],
      ['🥐', 'croissant bakery'], ['🍞', 'bread'], ['🍰', 'cake dessert'], ['🍪', 'cookie'],
      ['🍎', 'apple fruit'], ['🍋', 'lemon'], ['🥑', 'avocado'], ['🌶️', 'pepper spicy'],
      ['☕', 'coffee'], ['🍵', 'tea'], ['🧃', 'juice'], ['🍷', 'wine'],
      ['🥩', 'meat steak'], ['🥚', 'egg'], ['🧀', 'cheese'], ['🛒', 'groceries shopping cart'],
    ],
  },
  {
    label: 'Work and school',
    emoji: [
      ['📝', 'memo note write'], ['📄', 'page document'], ['📚', 'books study'], ['📖', 'book reading'],
      ['🗂️', 'dividers folders'], ['📁', 'folder'], ['📌', 'pin'], ['📎', 'paperclip'],
      ['✏️', 'pencil'], ['🖊️', 'pen'], ['📐', 'ruler measure'], ['📏', 'ruler measure'],
      ['📅', 'calendar date'], ['🗓️', 'calendar plan'], ['⏰', 'alarm clock'], ['⏳', 'hourglass time'],
      ['📊', 'chart bar stats'], ['📈', 'chart up growth'], ['💼', 'briefcase work job'], ['🎓', 'graduation school'],
      ['🧪', 'test lab science'], ['🔬', 'microscope science'], ['🧮', 'abacus math'], ['🗺️', 'map plan'],
    ],
  },
  {
    label: 'Tech',
    emoji: [
      ['💻', 'laptop computer code'], ['🖥️', 'desktop computer'], ['⌨️', 'keyboard typing'], ['🖱️', 'mouse'],
      ['📱', 'phone mobile'], ['🧑‍💻', 'developer coder'], ['🤖', 'robot ai bot'], ['🧠', 'brain think'],
      ['🛠️', 'tools build'], ['⚙️', 'gear settings config'], ['🔗', 'link chain'], ['🔒', 'lock security'],
      ['🌐', 'globe web internet'], ['📡', 'antenna network'], ['🛰️', 'satellite'], ['🗄️', 'cabinet server storage'],
      ['💾', 'save disk'], ['🎮', 'game controller gaming'], ['🕹️', 'joystick game'], ['📷', 'camera photo'],
      ['🎧', 'headphones music'], ['🎙️', 'microphone stream podcast'], ['📺', 'tv screen'], ['🔋', 'battery'],
    ],
  },
  {
    label: 'Life',
    emoji: [
      ['❤️', 'heart love'], ['💪', 'strong gym fitness'], ['🏋️', 'weights gym lifting'], ['🏃', 'running run'],
      ['🧘', 'yoga calm'], ['🩺', 'health doctor'], ['💊', 'pill medicine'], ['😴', 'sleep tired'],
      ['🎉', 'party celebrate'], ['🎁', 'gift present'], ['✈️', 'plane travel trip'], ['🧳', 'luggage travel'],
      ['💰', 'money'], ['💳', 'card pay'], ['🧾', 'receipt bills'], ['🏦', 'bank'],
      ['🎵', 'music note'], ['🎬', 'film movie'], ['📸', 'photo'], ['✍️', 'writing journal'],
      ['👥', 'people team'], ['💬', 'chat message'], ['📮', 'mail post'], ['🗳️', 'vote'],
    ],
  },
  {
    label: 'Symbols',
    emoji: [
      ['✅', 'check done'], ['☑️', 'checkbox'], ['❌', 'cross no'], ['⚠️', 'warning'],
      ['❓', 'question'], ['❗', 'important'], ['💭', 'thought idea'], ['🎯', 'target goal'],
      ['🚀', 'rocket launch'], ['🏁', 'finish flag'], ['🚩', 'flag'], ['🔖', 'bookmark'],
      ['🧩', 'puzzle'], ['🔍', 'search magnifier'], ['♻️', 'recycle'], ['🔄', 'repeat sync'],
      ['🟢', 'green circle'], ['🟡', 'yellow circle'], ['🔴', 'red circle'], ['🔵', 'blue circle'],
      ['🟣', 'purple circle'], ['🟤', 'brown circle'], ['⚪', 'white circle'], ['⚫', 'black circle'],
    ],
  },
]

/** Emoji whose search words match `query`, in group order. */
export function searchEmoji(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: string[] = []
  for (const group of EMOJI) {
    for (const [emoji, words] of group.emoji) {
      if (words.split(' ').some((w) => w.startsWith(q)) && !out.includes(emoji)) out.push(emoji)
    }
  }
  return out
}
