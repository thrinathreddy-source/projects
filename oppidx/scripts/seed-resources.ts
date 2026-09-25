/**
 * One-time hand-curated seed for the Financial Literacy and Spiritual
 * Literacy resource categories — deliberately not scraped. Financial
 * literacy scams and "spiritual teacher" grifting are both real enough that
 * these two categories are seeded from a short, name-checked list of
 * well-established, non-commercial institutions and primary texts, not an
 * open crawl. Spiritual Literacy is scoped strictly to Advaita Vedanta, as
 * requested — not spirituality-in-general.
 *
 * Two kinds of entries: plain links to external institutions/texts, and
 * "native" entries with original long-form writing in `body` (source:
 * "native") — plain-language explainers hosted directly on OppIDX's own
 * /resources/[id] page, each pointing `url` at one further-reading source
 * rather than being the resource itself.
 *
 * Every entry still runs through the same live-link check (see
 * lib/resources/verify.ts) as a public submission before being inserted —
 * a URL that's gone stale since this list was written is skipped and
 * reported, not force-added.
 *
 *   npx ts-node scripts/seed-resources.ts
 */

import { prisma } from '../lib/db'
import { checkUrlReachable, getExistingNormalizedUrls, normalizeUrl } from '../lib/resources/verify'

interface SeedResource {
  title: string
  description: string
  url: string
  category: 'Financial Literacy' | 'Spiritual Literacy'
  // Original long-form writing, in plain language — set only for the
  // "native" articles at the bottom of this file. When present, `url`
  // becomes a "further reading" link rather than the resource itself.
  body?: string
}

const SEED: SeedResource[] = [
  // ── Financial Literacy ──────────────────────────────────────────────
  {
    title: 'Zerodha Varsity',
    description: 'Free, module-by-module stock market and personal finance education from India\'s largest broker — from the fundamentals through options theory. No account or purchase required to read it.',
    url: 'https://zerodha.com/varsity/',
    category: 'Financial Literacy',
  },
  {
    title: 'RBI — Financial Education',
    description: 'The Reserve Bank of India\'s own financial literacy portal — savings, credit, digital payments and fraud awareness, explained by the regulator itself.',
    url: 'https://www.rbi.org.in/financialeducation/',
    category: 'Financial Literacy',
  },
  {
    title: 'SEBI Investor Education',
    description: 'India\'s securities market regulator\'s investor education resources — how markets actually work, and how to spot the schemes that prey on people who don\'t know yet.',
    url: 'https://investor.sebi.gov.in/',
    category: 'Financial Literacy',
  },
  {
    title: 'Khan Academy — Personal Finance',
    description: 'Free, structured course covering budgeting, credit, taxes, and investing basics — no ads, no product to sell you.',
    url: 'https://www.khanacademy.org/college-careers-more/personal-finance',
    category: 'Financial Literacy',
  },
  {
    title: 'r/IndiaInvestments Wiki',
    description: 'A community-maintained, heavily cross-checked wiki covering Indian personal finance specifically — taxes, mutual funds, insurance, and the scams unique to the Indian market.',
    url: 'https://www.reddit.com/r/IndiaInvestments/wiki/index/',
    category: 'Financial Literacy',
  },

  // ── Spiritual Literacy (Advaita Vedanta) ────────────────────────────
  {
    title: 'Sri Ramanasramam',
    description: 'The ashram of Sri Ramana Maharshi, and the primary source for his teachings on self-inquiry (atma-vichara) — talks, writings, and biographical material published directly by the institution he founded.',
    url: 'https://www.sriramanamaharshi.org/',
    category: 'Spiritual Literacy',
  },
  {
    title: 'Arsha Vidya Gurukulam',
    description: 'A traditional Vedanta teaching institution founded by Swami Dayananda Saraswati — structured study of Advaita Vedanta in the classical guru-shishya, text-based tradition rather than a single teacher\'s personal philosophy.',
    url: 'https://www.arshavidya.org/',
    category: 'Spiritual Literacy',
  },
  {
    title: 'Chinmaya Mission',
    description: 'A large, long-established Vedanta teaching organization founded by Swami Chinmayananda — study groups, texts, and courses grounded in classical Advaita Vedanta scholarship.',
    url: 'https://www.chinmayamission.com/',
    category: 'Spiritual Literacy',
  },
  {
    title: 'Vedanta Society of Northern California',
    description: 'Part of the Ramakrishna-Vivekananda lineage, teaching Advaita Vedanta in the West since the early 1900s — talks, texts, and introductory material for newcomers to the tradition.',
    url: 'https://www.vedanta.org/',
    category: 'Spiritual Literacy',
  },
  {
    title: 'Advaita Vision',
    description: 'A long-running, carefully edited resource for studying Advaita Vedanta — book reviews, essays, and Q&A that engage with the tradition\'s actual texts and arguments rather than pop-spirituality paraphrasing.',
    url: 'https://www.advaita-vision.org/',
    category: 'Spiritual Literacy',
  },
  {
    title: 'Stanford Encyclopedia of Philosophy — Śaṅkara',
    description: 'A peer-reviewed academic overview of Śaṅkara, Advaita Vedanta\'s most authoritative philosopher, and the tradition\'s core claims — the right starting point for understanding what Advaita actually argues, before going to primary texts.',
    url: 'https://plato.stanford.edu/entries/shankara/',
    category: 'Spiritual Literacy',
  },
  {
    title: '"I Am That" — Sri Nisargadatta Maharaj',
    description: 'The full text of Nisargadatta Maharaj\'s dialogues on self-realization, freely available — one of the most direct primary texts in the modern Advaita tradition.',
    url: 'https://archive.org/details/IAmThatBySriNisargadattaMaharaj',
    category: 'Spiritual Literacy',
  },

  // ── Financial Literacy — original explainers, plain language ────────
  {
    title: 'Compound interest, actually explained',
    description: 'Why the same rate of return is worth so much more the earlier you start — with real numbers, not just the slogan "start early."',
    url: 'https://zerodha.com/varsity/',
    category: 'Financial Literacy',
    body: `Compound interest is just this: you earn returns not only on the money you put in, but on the returns that money already earned. That sounds small until you see it with numbers.

Put ₹10,000 into something earning 10% a year. After year one, you have ₹11,000 — that part's obvious, it's just 10% of ₹10,000. But in year two, you don't earn 10% of ₹10,000 again. You earn 10% of ₹11,000, because your gains are now part of your balance too. That's ₹1,100, not ₹1,000. Small difference at first. But run that forward 20 years and ₹10,000 becomes about ₹67,000 — not ₹30,000, which is what you'd get if it grew by a flat ₹1,000 a year (simple interest, no compounding).

The reason "start early" actually matters, concretely: time is the one input to this formula you can never buy back. Someone who invests ₹5,000 a month from age 22 to 32 (10 years, then stops and just lets it sit) will very likely end up with more money at 60 than someone who invests the same ₹5,000 a month from age 32 to 60 (28 years, more than double the contributions) — because the first person's money had 38 years to compound, not 28.

The same math works against you with debt. Credit card interest compounds too, usually monthly, at rates far higher than any investment realistically earns. An unpaid balance doesn't grow by a fixed amount each month — it grows by a percentage of whatever it's already grown to. That's why credit card debt spirals so fast if you're only paying the minimum.

None of this requires you to be good at math. It requires two decisions: start putting something away now, even a small amount, and don't carry high-interest debt longer than you have to. The rest is just time doing the work.`,
  },
  {
    title: 'Budgeting basics: the 50/30/20 rule',
    description: 'A simple starting framework for splitting your income — needs, wants, and savings — and why "pay yourself first" is the one habit that makes it stick.',
    url: 'https://www.khanacademy.org/college-careers-more/personal-finance',
    category: 'Financial Literacy',
    body: `The 50/30/20 rule is a starting point for splitting your income, not a law. Roughly: 50% goes to needs (rent, groceries, utilities, transport, minimum debt payments — things you can't skip), 30% goes to wants (eating out, entertainment, subscriptions, things that are genuinely optional), and 20% goes to savings or paying down debt faster than the minimum.

It won't fit everyone exactly. If you live somewhere expensive, needs might eat 65% of your income and that's not a personal failure, it's arithmetic — adjust the split, don't abandon the idea. The value isn't the exact numbers, it's having any deliberate split at all instead of finding out at the end of the month where the money went.

The one habit that actually makes a budget work is paying yourself first: the moment income arrives, move the savings portion somewhere you won't casually spend it — a separate account, an automatic SIP, whatever creates friction between you and that money. If saving is "whatever's left after I spend," there's usually nothing left, not because you're bad with money, but because spending naturally expands to fill whatever's available. Move the saving to the front of the month, not the back.

Two practical notes. First, "wants" isn't a shameful category — a life with zero discretionary spending usually doesn't last, people burn out and overspend later to compensate. Budget the fun in, on purpose, at a size you've chosen. Second, track for one real month before judging yourself — most people are surprised by where money actually goes versus where they assumed it went, and you can't fix a category you haven't measured.`,
  },
  {
    title: 'SIPs and mutual funds, explained without jargon',
    description: 'What a mutual fund actually is, what a SIP does differently from a lump sum, and why "rupee-cost averaging" is a real mechanism, not marketing.',
    url: 'https://zerodha.com/varsity/',
    category: 'Financial Literacy',
    body: `A mutual fund is pooled money. Thousands of people each put in some amount, a professional fund manager combines it all and buys a basket of stocks or bonds with it, and each investor owns a slice of that basket proportional to what they put in. You get diversification (many companies, not one) and professional management, without needing to pick individual stocks yourself.

A SIP — Systematic Investment Plan — isn't a different product, it's a different way of buying into a fund: a fixed amount, automatically, on a set schedule (usually monthly), instead of one lump sum. The mechanism that makes this genuinely useful, not just convenient, is called rupee-cost averaging: because you're investing the same fixed amount each time, you automatically buy more units when prices are low and fewer units when prices are high. You never have to decide "is now a good time to invest?" — the averaging does that work for you across market ups and downs, which matters because reliably timing the market is something almost nobody does consistently, professionals included.

What a SIP doesn't do: guarantee a return. Mutual funds carry market risk — the value can go down as well as up, and past performance is not a promise of future performance. That's a real disclosure, not fine print to ignore. What a SIP is good at is turning investing into a habit instead of a decision you have to keep making, which for most people matters more than any small edge from perfect timing.

Before choosing a fund, the two things worth actually understanding are what it invests in (equity funds are more volatile with higher long-term potential, debt funds are steadier with lower potential) and its expense ratio (the annual fee, since a higher fee is a permanent drag on your returns regardless of how the fund performs).`,
  },
  {
    title: 'Understanding your credit score',
    description: 'What actually moves the number, why it matters beyond just "getting a loan," and the small habits that protect it.',
    url: 'https://www.rbi.org.in/financialeducation/',
    category: 'Financial Literacy',
    body: `A credit score (in India, typically 300–900, from bureaus like CIBIL, Experian, Equifax, or CRIF) is a summary of how reliably you've handled debt in the past — banks and lenders use it to guess how reliably you'll handle it in the future.

What moves it, roughly in order of weight: payment history matters most — paying every bill (credit cards, loan EMIs) on time, every time, is the single biggest lever you control. Credit utilization is next — how much of your available credit you're actually using; maxing out a credit card even if you pay it off monthly can hurt your score, because it looks like you're relying heavily on borrowed money. Length of credit history matters too — an older account in good standing helps, which is one real reason to think twice before closing your oldest credit card. Having a mix of credit types (a card, a loan) can help modestly, and applying for a lot of new credit in a short window hurts, because each hard inquiry signals possible financial stress.

Why it matters beyond loan approval: a better score often gets you a meaningfully lower interest rate on the same loan, which over years can be a large amount of money — not just a yes/no gate.

Practical habits: set up autopay for at least the minimum due so a forgotten due date never becomes a missed payment. Try to keep utilization under roughly 30% of your limit. Don't apply for several cards or loans in a short span unless you actually need to. And check your own credit report periodically (you're entitled to a free report from each bureau) — errors happen, and they don't fix themselves if nobody notices.`,
  },
  {
    title: 'Emergency funds: how much, and why',
    description: 'What an emergency fund is for, how much is actually enough, and why it belongs in a savings account, not the stock market.',
    url: 'https://investor.sebi.gov.in/',
    category: 'Financial Literacy',
    body: `An emergency fund is money set aside for genuine emergencies — job loss, a medical bill, an urgent repair — and nothing else. Not a vacation, not an investment opportunity, not a "good deal." Its entire job is to be there, boring and unspent, until the day you actually need it.

How much is enough is a range, not a fixed rule: a common starting target is 3 to 6 months of essential expenses (not your full income — just rent, food, utilities, minimum debt payments, the things you can't skip). If your income is unpredictable — freelance work, a founder's income, commission-based pay — leaning toward 6 to 12 months is more honest, since you can't count on the next paycheck landing on schedule.

Where you keep it matters as much as how much: a savings account or a liquid fund, something stable and accessible within a day or two — not the stock market, not a mutual fund tied to equities, not anything that could lose 20% of its value in the exact month you need to withdraw it. The point of this money isn't to grow, it's to be there. Growth is what the rest of your savings are for.

Why it's worth building before almost anything else: without it, an unexpected expense usually gets paid for with a credit card or a personal loan at a high interest rate, turning a one-time problem into a recurring one. An emergency fund's real return isn't the (small) interest it earns sitting in a savings account — it's every high-interest debt it lets you avoid taking on in the first place.`,
  },
  {
    title: 'Common financial scams and how to spot them',
    description: 'The patterns behind most financial fraud — guaranteed returns, urgency, impersonation — so you can recognize a new scam even if you\'ve never seen that exact one before.',
    url: 'https://investor.sebi.gov.in/',
    category: 'Financial Literacy',
    body: `Most financial scams reuse the same handful of patterns, even when the specific story changes. Learning the patterns matters more than memorizing a list of known scams, because new ones show up constantly.

Guaranteed high returns is the biggest one. Every legitimate investment carries risk, and returns move with that risk — nobody can honestly promise you'll double your money in six months, or get a fixed 3% a month, no matter what they claim to invest in. If a return is guaranteed and unusually high, the guarantee itself is the lie.

Impersonating your bank or a government agency is next. A call, SMS, or WhatsApp message claiming to be your bank, asking you to "verify" your account by sharing an OTP, PIN, or full card number — your bank already has that information and will never ask you for it. The same goes for messages demanding an "urgent KYC update" via a link that isn't your bank's own app or official website.

Manufactured urgency is the mechanism that makes both of the above work: "act in the next 10 minutes or lose access," "limited slots left," a countdown timer. Urgency is designed to stop you from pausing to check — which is exactly why pausing to check is the right response.

Unregistered advisors and platforms are a quieter version of the same problem — someone offering investment advice, or a trading/crypto platform promising fixed daily returns, without being registered with the actual regulator (in India, SEBI for securities, RBI for banking). You can check SEBI's registered intermediary list yourself before trusting anyone with money.

The practical rule that covers almost all of this: verify through the official channel yourself — the bank's own app, the number on the back of your card, the regulator's own website — never through a link or number the message itself gave you. And treat "too good to be true" as a literal description, not a cliché.`,
  },

  // ── Spiritual Literacy — original explainers, plain language ────────
  // Scoped strictly to Advaita Vedanta, drawn from its core texts (the
  // Upanishads, Shankara's commentaries) and its best-documented modern
  // teacher (Ramana Maharshi) — described educationally, not asserted as
  // doctrine the reader must accept.
  {
    title: 'What does "Advaita" actually mean?',
    description: 'The literal meaning of "non-dual," what Advaita Vedanta actually claims, and the common misreading — that it says the world is nothing — that it doesn\'t.',
    url: 'https://plato.stanford.edu/entries/shankara/',
    category: 'Spiritual Literacy',
    body: `Advaita is Sanskrit for "not-two" — non-dual. Advaita Vedanta is the school of Indian philosophy built around one central claim: that ultimate reality is a single, undivided consciousness, usually called Brahman, and that the felt sense of being a separate, limited individual — this body, this personality, cut off from everything else — is not the final truth about you, even though it's how things ordinarily appear.

It was systematized primarily by Adi Shankaracharya, a philosopher and teacher who lived around the 8th century CE, through commentaries on three foundational texts collectively called the Prasthanatrayi: the Upanishads (the older philosophical portions of the Vedas), the Bhagavad Gita, and the Brahma Sutras. Shankara didn't invent the ideas from nothing — he argued they were already there in these older texts — but he's the figure most responsible for Advaita becoming a coherent, defensible philosophical system.

The common misreading is that Advaita says the world is an illusion in the sense of being nothing at all, so nothing you do matters. That's not the actual claim. The world isn't said to be non-existent — you experience it, actions in it have real consequences, ethics apply fully within it. What Advaita says is that the world's apparent separateness — you as one thing, that as another thing, over there, distinct from everything else — is not the deepest layer of reality. Underneath the multiplicity, the claim goes, there is one undivided reality appearing as many, the way one ocean appears as many waves without ever actually stopping being one ocean.

That's the whole starting claim. Everything else in Advaita — the ideas of Atman, Maya, self-inquiry — is really just working out what follows if that one claim is true.`,
  },
  {
    title: 'Atman and Brahman: the core claim',
    description: 'What "Atman" and "Brahman" mean, and the Upanishadic teaching — "you are that" — that Advaita treats as its central insight.',
    url: 'https://www.sriramanamaharshi.org/',
    category: 'Spiritual Literacy',
    body: `Two words carry almost the entire weight of Advaita Vedanta: Atman and Brahman.

Atman means the innermost self — not your body, not your personality, not even your thoughts or emotions, but the bare awareness that's present underneath all of those, the thing that's aware of the body, the thoughts, the emotions, without itself being any of them. Brahman means the single, infinite, non-dual reality that underlies the entire universe — the "ground of being," if that phrase helps, though Advaita would say even that undersells it, since Brahman isn't a background behind things so much as the only thing that ultimately exists.

Advaita's central teaching is that these two are not two things — they're identical. This is stated directly in the Chandogya Upanishad as "Tat Tvam Asi," usually translated "That thou art," or more plainly: you, at your deepest level, are that ultimate reality. Not connected to it, not a fragment or spark of it — identical with it, the way a single wave, if it could stop mistaking itself for something separate, would recognize itself as simply the ocean.

This is easy to mishear as "my ego is God" — that's not the claim, and Advaita is explicit about the difference. The ego — the sense of "me, this particular person, with this history and these preferences" — is exactly the layer that's said to be a false identification, not the Atman itself. The claim isn't that your personality is divine; it's that underneath the personality, the bare awareness you actually are, once you stop confusing it with the personality wrapped around it, is not separate from the one reality everything else is made of either.

That identity — Atman is Brahman — is what Advaita means by "non-dual." It's not a metaphor about unity in a poetic sense; it's presented as a literal claim about what you most fundamentally are.`,
  },
  {
    title: 'What is Maya? (it\'s not just "illusion")',
    description: 'The classic rope-and-snake analogy, and why Maya means "the world appears as many when it\'s actually one" rather than "the world doesn\'t exist."',
    url: 'https://www.advaita-vision.org/',
    category: 'Spiritual Literacy',
    body: `Maya is one of the most commonly mistranslated words in Advaita Vedanta. Translated flatly as "illusion," it gets read as "the world is fake, so none of this matters" — which is close to the opposite of what the concept is doing.

Maya is better understood as the power or principle by which the one undivided Brahman appears as the many — as separate objects, separate people, distance, time, change. It's the answer to the question: if reality is genuinely one undivided thing, why does it look and feel like a world of separate, individual things? Maya is the name for whatever mechanism produces that appearance.

The classic illustration is a rope mistaken for a snake in dim light. Someone sees a coiled shape on the path at dusk, and genuine fear arises — the fear is real, the perception was real, something was definitely seen. But it wasn't ultimately a snake. Once you bring a light closer, you see it was always a rope; the "snake" wasn't nothing, and it wasn't fully real either — it was a mistaken appearance superimposed on something that was actually there all along. Advaita's technical term for this kind of mistaken overlay is adhyasa, superimposition.

That's the more accurate shape of the Maya claim: not "the world is nothing," but "the world's appearance of being made of separate, independent things is a superimposition on a reality that is actually one." The rope (Brahman) is real. The snake (the world experienced as fundamentally separate pieces) is not what it appears to be, without being simply nonexistent either — Advaita's term for this in-between status is mithya, meaning dependent or relative reality, neither fully real nor fully unreal.

The practical consequence Advaita draws from this is not "stop caring about the world." Within ordinary, everyday life — what Advaita calls the vyavaharika or transactional level — the world, your actions, and their consequences are completely real and matter fully. It's only from the absolute (paramarthika) standpoint that the deeper claim about non-separateness applies. The two aren't in conflict; they're described as two different levels of the same reality.`,
  },
  {
    title: 'Self-inquiry: Ramana Maharshi\'s "Who am I?"',
    description: 'How Ramana Maharshi\'s method of atma-vichara actually works, step by step — not a belief system, a direct practice of tracing attention back to its source.',
    url: 'https://www.sriramanamaharshi.org/',
    category: 'Spiritual Literacy',
    body: `Ramana Maharshi (1879–1950) is probably the most documented Advaita teacher of the modern era, based at Tiruvannamalai in South India. His central teaching was a method, not a doctrine to accept on faith: atma-vichara, self-inquiry, most simply stated as the practice of persistently asking "Who am I?"

This isn't meant as an intellectual riddle with a clever answer. The instruction is more like a practical technique: when a thought arises — any thought, worry, plan, memory — instead of following it, ask "to whom does this thought occur?" The honest answer is "to me." Then ask the next question: "who am I?" Not to produce a verbal answer ("I am a student," "I am a person with this job") — those answers are themselves just more thoughts, more content arising in awareness, not the awareness itself. The practice is to keep turning attention back toward the sense of "I" itself, past whatever thought or story is currently occupying it.

Done repeatedly, the claim is that this tracing-back eventually reveals that the felt sense of being a separate, bounded "I" — the thing that seemed to be doing all this inquiring — doesn't hold up under close attention the way it seemed to. What's left, according to this teaching, is awareness without a separate self superimposed on it: the Atman, recognized directly rather than accepted as a concept.

What makes this teaching distinct from a lot of what gets called "spirituality" is exactly that it isn't asking for belief in anything. It doesn't require accepting a cosmology, performing rituals, or joining an institution — it's presented as something you can try directly, right now, as a way of looking rather than a thing to believe. Ramana Maharshi himself discouraged elaborate theorizing about his teaching in favor of people simply doing the inquiry and finding out for themselves what happens.`,
  },
  {
    title: 'The three states of consciousness — and the "fourth"',
    description: 'Waking, dreaming, deep sleep, and turiya — the Mandukya Upanishad\'s map of consciousness, and why the "fourth" isn\'t really a fourth state at all.',
    url: 'https://plato.stanford.edu/entries/shankara/',
    category: 'Spiritual Literacy',
    body: `The Mandukya Upanishad is short — a few dozen lines — and entirely devoted to one teaching: a map of consciousness in three ordinary states, plus a fourth that isn't quite like the other three.

The three ordinary states are familiar to everyone, every day. Waking (jagrat) is the state where you experience an external world through the senses — this is the "self" most people mean when they say "me," the one having a day, interacting with other people and objects. Dreaming (svapna) is the state where the mind generates an entire internal world with no external senses involved — a self still appears to exist inside the dream, experiencing a world, but that world is made entirely of mind. Deep, dreamless sleep (sushupti) is different again: no external world, no internal dream-world, no objects of experience at all — and yet it isn't experienced as absence or suffering. People wake from deep sleep and describe it as restful, undisturbed, even though nothing was "experienced" in the usual sense.

Each of these three has a different relationship between a self and objects — external objects, internal (dream) objects, or no objects. The Mandukya's move is to ask: what is common to all three, present in each but identical with none of them, since it doesn't come and go the way waking, dreaming, and sleep come and go?

That constant is called turiya, "the fourth" — though the texts are careful to say it isn't really a fourth state alongside the other three, the way a fourth room might sit alongside three others. It's better described as the awareness in which all three states arise and pass, the witnessing presence that's there whether you're awake, dreaming, or deeply asleep, since something in you clearly persists across all three (you know you slept, you know you dreamed, even though "you" as the waking personality wasn't there to observe it happening). Advaita identifies this constant, background awareness with Atman — the same "you" the rest of the tradition keeps pointing back to, here approached through the structure of ordinary consciousness itself rather than through argument.`,
  },
  {
    title: 'Karma and free will in Advaita Vedanta, plainly',
    description: 'Why Advaita takes karma completely seriously at the level of daily life, while also teaching that your deepest self was never actually the one doing anything.',
    url: 'https://www.chinmayamission.com/',
    category: 'Spiritual Literacy',
    body: `Karma, at its plainest, is a cause-and-effect principle applied to action: intentional actions produce results, and those results shape the circumstances and tendencies you encounter later. It's not a claim about fixed, unchangeable fate — it's closer to "your choices have consequences, including consequences you don't see immediately," which is a fairly ordinary idea once it's stripped of mystique.

Advaita Vedanta takes this fully seriously at what it calls the vyavaharika level — ordinary, everyday, transactional life. Within that level, your effort matters, your ethical choices matter, cause and effect operate exactly as they appear to. Advaita is not a teaching that tells you actions don't matter or that trying is pointless — quite the opposite; a whole tradition within Vedanta, karma yoga, is specifically about acting fully and responsibly in the world.

The distinctive move Advaita makes is at the other level, the paramarthika or absolute standpoint. There, the argument goes, karma applies to the jiva — the individual person, bound up with a particular body and mind, the one who experiences themselves as a doer making choices with consequences. It does not apply to the Atman, the deepest self, because the Atman — as pure awareness, not a doer, not an agent, not a thing that acts — was never actually the one doing anything in the first place. Action happens within the field of body and mind; awareness itself, in this teaching, simply illuminates that it's happening, the way light illuminates a room without the light itself doing the moving around inside it.

The practical teaching most commonly drawn from this — especially associated with the Bhagavad Gita — is to act fully, carefully, and responsibly in the world, while holding the results more lightly than the effort: give the action your full attention, and hold the outcome without the same grip, since your deepest nature was never actually the anxious owner of that outcome to begin with. That's presented less as detachment from life and more as a different relationship to it — full engagement without the constant self-referential anxiety of "what does this mean for me."`,
  },
]

async function main() {
  // `url` is the resource itself for plain links, but just a citation for
  // native articles (several of which deliberately cite the same
  // further-reading link) — so only plain links are deduped by URL. Native
  // articles are deduped by title instead, since two articles legitimately
  // share a `url` without being the same resource.
  const seenUrls = await getExistingNormalizedUrls()
  const seenTitles = new Set(
    (await prisma.resource.findMany({ where: { deletedAt: null }, select: { title: true } })).map(r => r.title)
  )
  let added = 0
  let skippedDuplicate = 0
  let skippedDead = 0

  for (const entry of SEED) {
    const isNative = Boolean(entry.body)
    const urlKey = normalizeUrl(entry.url)

    if (isNative ? seenTitles.has(entry.title) : seenUrls.has(urlKey)) {
      console.log(`SKIP (duplicate): ${entry.title}`)
      skippedDuplicate++
      continue
    }

    const reachable = await checkUrlReachable(entry.url)
    if (!reachable.ok) {
      console.log(`SKIP (${reachable.reason}): ${entry.title} — ${entry.url}`)
      skippedDead++
      continue
    }

    await prisma.resource.create({
      data: {
        title: entry.title,
        description: entry.description,
        url: entry.url,
        category: entry.category,
        audience: 'GENERAL',
        verified: true,
        source: isNative ? 'native' : 'admin',
        body: entry.body ?? '',
      },
    })
    if (isNative) seenTitles.add(entry.title)
    else seenUrls.add(urlKey)
    added++
    console.log(`ADDED: ${entry.title}`)
  }

  console.log(`\nDone — added ${added}, skipped ${skippedDuplicate} duplicate(s), skipped ${skippedDead} dead link(s).`)
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
