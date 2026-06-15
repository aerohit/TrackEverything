/**
 * Pick an emoji for an input by keyword-matching its display name. Emojis are the
 * leanest "icon set" — they're glyphs in the system font, so there's no sprite
 * sheet, image request, or extra bytes to download (nothing to make the app slow).
 *
 * Rules are checked in order, most-specific first (e.g. "fish oil" must beat
 * "fish", and any supplement must beat a food keyword it happens to contain).
 */
const ICON_RULES: [RegExp, string][] = [
  [/pre.?workout/i, "⚡"],
  [/coffee|espresso|latte|cappuccino|americano|mocha/i, "☕"],
  [/\btea\b|matcha/i, "🍵"],
  [/electrolyte/i, "🧂"],
  [/beer|lager|\bipa\b/i, "🍺"],
  [/wine/i, "🍷"],
  [/whisk|vodka|\bgin\b|\brum\b|cocktail|\balcohol\b/i, "🍸"],
  [/smoothie/i, "🥤"],
  // Supplements / meds before foods they might contain ("fish oil", "iron"…).
  [/fish ?oil|omega|magnesium|melatonin|creatine|citrulline|vitamin|\bzinc\b|calcium|\biron\b|supplement|capsule|tablet|\bd3\b/i, "💊"],
  [/medication|paracetamol|acetaminophen|ibuprofen|aspirin|\bpill\b/i, "💊"],
  [/protein bar|granola bar|\bbar\b/i, "🍫"],
  [/protein|whey|\bshake\b/i, "🥛"],
  [/salad/i, "🥗"],
  [/pizza/i, "🍕"],
  [/burger/i, "🍔"],
  [/sandwich|toast|bread|bagel/i, "🥪"],
  [/chicken|poultry/i, "🍗"],
  [/salmon|tuna|\bfish\b|sushi/i, "🐟"],
  [/steak|beef|\bmeat\b/i, "🥩"],
  [/\begg/i, "🍳"],
  [/pasta|spaghetti|noodle/i, "🍝"],
  [/\brice\b/i, "🍚"],
  [/oat|porridge|cereal|muesli|granola/i, "🥣"],
  [/yogurt|yoghurt/i, "🥛"],
  [/banana/i, "🍌"],
  [/apple/i, "🍎"],
  [/berr/i, "🫐"],
  [/almond|peanut|cashew|walnut|\bnuts?\b/i, "🥜"],
  [/chocolate|cocoa/i, "🍫"],
  [/\bmilk\b/i, "🥛"],
  [/\bwater\b/i, "💧"],
  [/snack|crisp|chips|popcorn|pretzel/i, "🍿"],
  [/breakfast/i, "🍳"],
  [/lunch|dinner|\bmeal\b|plate/i, "🍽️"],
];

export function iconForInput(name: string): string {
  for (const [re, icon] of ICON_RULES) {
    if (re.test(name)) return icon;
  }
  return "🍽️";
}
