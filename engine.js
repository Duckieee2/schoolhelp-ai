/**
 * NoteBuddy AI Engine
 * Zero models. Zero tokens. Zero cost.
 * Pure intent detection + knowledge base + Wikipedia fallback.
 */

// ─────────────────────────────────────────────
//  MATHS ENGINE
// ─────────────────────────────────────────────
function tryMaths(q) {
  const s = q.trim();

  // Direct arithmetic: supports +,-,*,/,^,%, brackets, decimals
  const arith = s.replace(/[^0-9+\-*/^%().√\s]/g, '');
  if (/^[\d+\-*/^%().\s√]+$/.test(arith) && arith.trim().length > 0) {
    try {
      const safe = arith
        .replace(/\^/g, '**')
        .replace(/√(\d+(\.\d+)?)/g, (_, n) => `Math.sqrt(${n})`);
      const result = Function('"use strict"; return (' + safe + ')')();
      if (typeof result === 'number' && isFinite(result)) {
        return `**${s.trim()} = ${parseFloat(result.toFixed(10))}**`;
      }
    } catch (_) {}
  }

  // Quadratic: ax^2 + bx + c = 0
  const quad = s.match(/(-?\d*\.?\d*)x\^?2\s*([+-]\s*\d*\.?\d*)x\s*([+-]\s*\d+\.?\d*)\s*=\s*0/i);
  if (quad) {
    const a = parseFloat(quad[1] || '1');
    const b = parseFloat(quad[2].replace(/\s/g, '') || '1');
    const c = parseFloat(quad[3].replace(/\s/g, ''));
    const disc = b * b - 4 * a * c;
    if (disc < 0) return `**No real solutions.** (discriminant = ${disc} < 0)\n\nComplex roots: x = ${(-b/(2*a)).toFixed(3)} ± ${(Math.sqrt(-disc)/(2*a)).toFixed(3)}i`;
    const x1 = (-b + Math.sqrt(disc)) / (2 * a);
    const x2 = (-b - Math.sqrt(disc)) / (2 * a);
    return `**Quadratic Solution**\n\nUsing the quadratic formula:\n\nx = (-b ± √(b²-4ac)) / 2a\n\n- a = ${a}, b = ${b}, c = ${c}\n- Discriminant = ${disc}\n- **x₁ = ${parseFloat(x1.toFixed(6))}**\n- **x₂ = ${parseFloat(x2.toFixed(6))}**`;
  }

  // Percentage
  const pct = s.match(/what\s+is\s+(\d+\.?\d*)%\s+of\s+(\d+\.?\d*)/i);
  if (pct) {
    const result = (parseFloat(pct[1]) / 100) * parseFloat(pct[2]);
    return `**${pct[1]}% of ${pct[2]} = ${parseFloat(result.toFixed(4))}**`;
  }

  // Pythagorean theorem
  const pyth = s.match(/(?:pythagor|hypotenuse|a=(\d+\.?\d*)[,\s]+b=(\d+\.?\d*))/i);
  if (pyth && pyth[1] && pyth[2]) {
    const a = parseFloat(pyth[1]), b = parseFloat(pyth[2]);
    const c = Math.sqrt(a * a + b * b);
    return `**Pythagorean Theorem**\n\na² + b² = c²\n\n${a}² + ${b}² = c²\n\nc = √(${a*a} + ${b*b}) = **${parseFloat(c.toFixed(6))}**`;
  }

  // Area/perimeter of shapes
  const circle = s.match(/(?:area|circumference)\s+of\s+(?:a\s+)?circle\s+(?:with\s+)?(?:radius|r)\s*=?\s*(\d+\.?\d*)/i);
  if (circle) {
    const r = parseFloat(circle[1]);
    const isCirc = /circumference/i.test(s);
    if (isCirc) return `**Circumference** = 2πr = 2 × π × ${r} = **${parseFloat((2*Math.PI*r).toFixed(6))}**`;
    return `**Area of Circle** = πr² = π × ${r}² = **${parseFloat((Math.PI*r*r).toFixed(6))}**`;
  }

  // Prime check
  const prime = s.match(/is\s+(\d+)\s+(?:a\s+)?prime/i);
  if (prime) {
    const n = parseInt(prime[1]);
    const isPrime = n > 1 && !Array.from({length: Math.floor(Math.sqrt(n))-1}, (_,i)=>i+2).some(i=>n%i===0);
    return `**${n} is ${isPrime ? '' : 'not '}a prime number.**\n\n${isPrime ? `It has only two factors: 1 and ${n}.` : `It can be divided by numbers other than 1 and itself.`}`;
  }

  // Factorial
  const fact = s.match(/(\d+)!/);
  if (fact) {
    const n = parseInt(fact[1]);
    if (n > 20) return `${n}! is a very large number. Use Stirling's approximation for large factorials.`;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return `**${n}! = ${result}**`;
  }

  // Powers
  const pow = s.match(/(\d+\.?\d*)\s*(?:to the power of|\^|\*\*)\s*(\d+\.?\d*)/i);
  if (pow) {
    const result = Math.pow(parseFloat(pow[1]), parseFloat(pow[2]));
    return `**${pow[1]}^${pow[2]} = ${parseFloat(result.toFixed(10))}**`;
  }

  // Square root
  const sqrt = s.match(/(?:square root|sqrt|√)\s+of\s+(\d+\.?\d*)/i);
  if (sqrt) {
    const n = parseFloat(sqrt[1]);
    return `**√${n} = ${parseFloat(Math.sqrt(n).toFixed(10))}**`;
  }

  // Mean / average
  const mean = s.match(/(?:mean|average)\s+of\s+([\d,.\s]+)/i);
  if (mean) {
    const nums = mean[1].split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
    if (nums.length) {
      const avg = nums.reduce((a,b)=>a+b,0)/nums.length;
      return `**Mean of [${nums.join(', ')}]**\n\nSum = ${nums.reduce((a,b)=>a+b,0)}\nCount = ${nums.length}\n**Mean = ${parseFloat(avg.toFixed(6))}**`;
    }
  }

  return null;
}

// ─────────────────────────────────────────────
//  KNOWLEDGE BASE
// ─────────────────────────────────────────────
const KB = {
  // Science
  "what is photosynthesis": "**Photosynthesis** is the process by which plants use sunlight, water, and CO₂ to produce glucose and oxygen.\n\n**Equation:**\n```\n6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂\n```\n\n**Stages:**\n1. **Light reactions** – occur in the thylakoid membrane, produce ATP and NADPH\n2. **Calvin cycle** – occurs in the stroma, produces glucose",
  "what is osmosis": "**Osmosis** is the movement of water molecules through a selectively permeable membrane from an area of **high water potential** (low solute concentration) to **low water potential** (high solute concentration).\n\n- **Hypotonic solution** → cell swells\n- **Hypertonic solution** → cell shrinks (plasmolysis in plants)\n- **Isotonic solution** → no net movement",
  "what is mitosis": "**Mitosis** is cell division producing two genetically identical daughter cells.\n\n**Stages:** PMAT\n1. **Prophase** – chromosomes condense, spindle forms\n2. **Metaphase** – chromosomes align at cell equator\n3. **Anaphase** – chromatids pulled to opposite poles\n4. **Telophase** – nuclear envelope reforms, cytokinesis\n\n**Purpose:** Growth, repair, asexual reproduction",
  "what is meiosis": "**Meiosis** produces 4 genetically unique haploid cells (gametes).\n\n**Two divisions:**\n- **Meiosis I** – homologous pairs separate (crossing over occurs)\n- **Meiosis II** – sister chromatids separate\n\n**Result:** 4 cells with half the chromosome number\n**Purpose:** Sexual reproduction, genetic variation",
  "what is dna": "**DNA (Deoxyribonucleic Acid)** is the molecule that carries genetic information.\n\n**Structure:**\n- Double helix (Watson & Crick, 1953)\n- Made of nucleotides: sugar + phosphate + base\n- **Base pairs:** A-T and C-G\n\n**Functions:**\n- Stores genetic code\n- Replicates during cell division\n- Codes for proteins via mRNA",
  "what is newton's first law": "**Newton's First Law (Law of Inertia):**\n\n> An object at rest stays at rest, and an object in motion stays in motion at the same speed and direction, unless acted upon by an unbalanced force.\n\n**Examples:**\n- A ball rolling on a frictionless surface keeps rolling\n- Passengers lurch forward when a car brakes suddenly",
  "what is newton's second law": "**Newton's Second Law:**\n\n> Force = Mass × Acceleration\n\n**F = ma**\n\n- F = force (Newtons, N)\n- m = mass (kg)\n- a = acceleration (m/s²)\n\n**Example:** A 5kg object accelerating at 3 m/s² requires F = 5 × 3 = **15 N**",
  "what is newton's third law": "**Newton's Third Law:**\n\n> For every action, there is an equal and opposite reaction.\n\n**Examples:**\n- A rocket expels gas downward → rocket moves upward\n- You push a wall → the wall pushes back with equal force",
  "what is gravity": "**Gravity** is a fundamental force of attraction between objects with mass.\n\n**Newton's Law of Universal Gravitation:**\n```\nF = G(m₁m₂)/r²\n```\n- G = 6.674 × 10⁻¹¹ N·m²/kg²\n- On Earth's surface: g ≈ **9.81 m/s²**\n\n**Einstein's view:** Gravity is the curvature of spacetime caused by mass.",
  "what is the periodic table": "**The Periodic Table** organises all 118 known elements by atomic number.\n\n**Key features:**\n- **Periods** (rows) – elements in the same period have the same number of electron shells\n- **Groups** (columns) – elements in the same group have similar chemical properties\n- **Metals** (left/centre), **Metalloids** (middle), **Non-metals** (right)\n\n**Important groups:**\n- Group 1: Alkali metals (very reactive)\n- Group 7: Halogens\n- Group 0: Noble gases (inert)",
  "what is evolution": "**Evolution** is the change in heritable characteristics of populations over successive generations.\n\n**Darwin's Natural Selection:**\n1. Variation exists in a population\n2. Some traits aid survival/reproduction\n3. Those traits are inherited\n4. Over time, favourable traits become more common\n\n**Evidence:** Fossil record, comparative anatomy, DNA similarity, observed speciation",

  // History
  "when did world war 2 start": "**World War 2** began on **1 September 1939** when Germany invaded Poland.\n\nBritain and France declared war on Germany on **3 September 1939**.\n\n**Key dates:**\n- 1939 – Germany invades Poland\n- 1940 – Battle of Britain, Dunkirk\n- 1941 – USSR and USA enter the war\n- 1944 – D-Day (6 June)\n- 1945 – Germany surrenders (8 May, VE Day), Japan surrenders (2 Sept, VJ Day)",
  "when did world war 1 start": "**World War 1** began on **28 July 1914**, triggered by the assassination of Archduke Franz Ferdinand on 28 June 1914.\n\n**Causes (MAIN):**\n- **M**ilitarism\n- **A**lliances (Triple Entente vs Triple Alliance)\n- **I**mperialism\n- **N**ationalism\n\n**End:** 11 November 1918 (Armistice)",
  "who was henry viii": "**Henry VIII** (1491–1547) was King of England from 1509.\n\n**Famous for:**\n- Having **6 wives**: Catherine of Aragon, Anne Boleyn, Jane Seymour, Anne of Cleves, Catherine Howard, Catherine Parr\n- Breaking from the Catholic Church to form the **Church of England** (so he could divorce Catherine of Aragon)\n- The **Dissolution of the Monasteries**\n\n**Wives' fates:** Divorced, Beheaded, Died, Divorced, Beheaded, Survived",
  "what was the cold war": "**The Cold War** (1947–1991) was a period of geopolitical tension between the **USA** (and Western allies) and the **USSR** (and Eastern bloc) — never direct armed conflict.\n\n**Key events:**\n- 1947 – Truman Doctrine, Marshall Plan\n- 1950–53 – Korean War\n- 1962 – Cuban Missile Crisis\n- 1969 – Moon landings (Space Race)\n- 1989 – Berlin Wall falls\n- 1991 – USSR dissolves",
  "who was napoleon": "**Napoleon Bonaparte** (1769–1821) was a French military and political leader who rose to prominence during the French Revolution.\n\n**Key facts:**\n- Emperor of France 1804–1814/1815\n- Reformed French law via the **Napoleonic Code**\n- Conquered much of Europe\n- Defeated at the **Battle of Waterloo** (1815)\n- Exiled to Saint Helena where he died",

  // Geography
  "what is the water cycle": "**The Water Cycle (Hydrological Cycle)**\n\n**Stages:**\n1. **Evaporation** – Sun heats water, turns to vapour\n2. **Transpiration** – Plants release water vapour\n3. **Condensation** – Water vapour cools, forms clouds\n4. **Precipitation** – Rain, snow, sleet falls\n5. **Collection** – Water collects in rivers, lakes, oceans\n6. **Infiltration** – Water soaks into ground\n7. **Surface runoff** – Water flows over land to rivers",
  "what is plate tectonics": "**Plate Tectonics** – Earth's crust is divided into large plates that move slowly.\n\n**Plate boundaries:**\n- **Constructive** – plates move apart, magma fills gap (e.g. Mid-Atlantic Ridge)\n- **Destructive** – plates collide, one subducts (causes volcanoes, earthquakes)\n- **Conservative** – plates slide past each other (e.g. San Andreas Fault)\n\n**Causes movement:** Convection currents in the mantle",
  "what is climate change": "**Climate Change** refers to long-term shifts in global temperatures and weather patterns.\n\n**Causes:**\n- Burning fossil fuels → CO₂, CH₄ emissions\n- Deforestation\n- Industrial processes\n\n**Effects:**\n- Rising sea levels\n- More extreme weather\n- Loss of biodiversity\n- Melting ice caps\n\n**Greenhouse gases:** CO₂, Methane, Nitrous oxide, Water vapour",

  // English / Literature
  "what is a simile": "**A simile** is a figure of speech that compares two things using **'like'** or **'as'**.\n\n**Examples:**\n- *'She ran like the wind'*\n- *'He was as brave as a lion'*\n- *'The stars shone like diamonds'*\n\n**Difference from metaphor:** A simile says something is *like* something else; a metaphor says it *is* that thing.",
  "what is a metaphor": "**A metaphor** is a figure of speech that directly states one thing *is* another, creating a comparison without using 'like' or 'as'.\n\n**Examples:**\n- *'Life is a rollercoaster'*\n- *'Time is money'*\n- *'The world is a stage'* (Shakespeare)\n\n**Effect:** Creates vivid imagery, implies deeper meaning",
  "what is alliteration": "**Alliteration** is the repetition of the same consonant sound at the beginning of nearby words.\n\n**Examples:**\n- *'Peter Piper picked a peck of pickled peppers'*\n- *'She sells seashells by the seashore'*\n- *'The fair breeze blew, the white foam flew'*\n\n**Effect in writing:** Creates rhythm, makes phrases memorable, can create mood",
  "what is onomatopoeia": "**Onomatopoeia** is when a word sounds like what it describes.\n\n**Examples:**\n- Buzz, crash, sizzle, hiss, boom, whisper, crackle\n\n**In literature:**\n- *'The bees buzzed lazily'* — you can almost hear the sound\n\n**Effect:** Makes writing more vivid and sensory",
  "what is iambic pentameter": "**Iambic pentameter** is a metre in poetry:\n- **Iamb** = one unstressed syllable followed by one stressed (da-DUM)\n- **Pentameter** = five iambs per line = 10 syllables\n\n**Example (Shakespeare):**\n*'Shall I compare thee to a summer's day?'*\nda-DUM / da-DUM / da-DUM / da-DUM / da-DUM\n\n**Used by:** Shakespeare, Milton, Keats",

  // Computer Science
  "what is an algorithm": "**An algorithm** is a step-by-step set of instructions to solve a problem or complete a task.\n\n**Properties of a good algorithm:**\n- **Correct** – produces the right output\n- **Efficient** – uses minimal time/memory\n- **Finite** – terminates after a set number of steps\n- **Unambiguous** – each step is clear\n\n**Examples:** Sorting algorithms, search algorithms, recipe steps",
  "what is binary": "**Binary** is a base-2 number system using only **0** and **1**.\n\n**Converting decimal to binary:**\n- 0 = 0000\n- 1 = 0001\n- 2 = 0010\n- 5 = 0101\n- 10 = 1010\n- 255 = 11111111\n\n**Why computers use binary:** Transistors have two states: on (1) and off (0).\n\n**Bits and bytes:** 8 bits = 1 byte",
  "what is a cpu": "**CPU (Central Processing Unit)** is the brain of a computer.\n\n**Main components:**\n- **ALU** (Arithmetic Logic Unit) – performs calculations\n- **Control Unit** – directs operations\n- **Registers** – tiny, fast storage\n- **Cache** – fast temporary memory\n\n**Fetch-Decode-Execute cycle:**\n1. Fetch instruction from memory\n2. Decode what it means\n3. Execute the instruction",
  "what is object oriented programming": "**Object-Oriented Programming (OOP)** organises code around objects rather than functions.\n\n**Four pillars:**\n1. **Encapsulation** – bundling data and methods together\n2. **Abstraction** – hiding complexity, showing only essentials\n3. **Inheritance** – child classes inherit from parent classes\n4. **Polymorphism** – same interface, different implementations\n\n**Languages:** Python, Java, C++, C#",
  "what is sorting": "**Sorting algorithms** arrange data in order.\n\n| Algorithm | Best | Average | Worst | Stable? |\n|---|---|---|---|---|\n| Bubble Sort | O(n) | O(n²) | O(n²) | Yes |\n| Merge Sort | O(n log n) | O(n log n) | O(n log n) | Yes |\n| Quick Sort | O(n log n) | O(n log n) | O(n²) | No |\n| Insertion Sort | O(n) | O(n²) | O(n²) | Yes |\n\n**Best general purpose:** Merge Sort (guaranteed O(n log n))",

  // General
  "what is the speed of light": "**Speed of light in a vacuum:**\n\nc = **299,792,458 m/s** (≈ 3 × 10⁸ m/s)\n\n- Light travels around Earth ~7.5 times per second\n- Light from the Sun reaches Earth in ~8 minutes 20 seconds\n- Nothing with mass can reach or exceed the speed of light (Einstein's Special Relativity)",
  "what is the solar system": "**The Solar System** consists of the Sun and everything gravitationally bound to it.\n\n**8 Planets (in order):**\n1. Mercury\n2. Venus\n3. Earth\n4. Mars\n5. Jupiter (largest)\n6. Saturn (rings)\n7. Uranus (rotates on its side)\n8. Neptune (furthest)\n\n**Also:** Dwarf planets (Pluto, Eris), asteroid belt, Kuiper belt, Oort cloud",
  "what is the human body": "**The Human Body** has 11 major organ systems:\n\n1. Skeletal (206 bones)\n2. Muscular (~600 muscles)\n3. Cardiovascular (heart, blood, vessels)\n4. Respiratory (lungs, airways)\n5. Digestive (mouth → anus)\n6. Nervous (brain, spinal cord, nerves)\n7. Endocrine (hormones)\n8. Immune/Lymphatic\n9. Urinary\n10. Reproductive\n11. Integumentary (skin, hair, nails)",
};

// ─────────────────────────────────────────────
//  INTENT DETECTION
// ─────────────────────────────────────────────
const INTENTS = [
  {
    name: 'greeting',
    patterns: [/^(hi|hello|hey|howdy|sup|yo|hiya|good morning|good afternoon|good evening)[\s!?]*$/i],
    responses: [
      "Hey! 👋 I'm **NoteBuddy**, your school assistant. Ask me about maths, science, history, geography, English, computer science — or anything else!",
      "Hello! I'm **NoteBuddy**. What subject are you working on today?",
      "Hi there! Ask me anything — maths, science, history, literature, CS, you name it!"
    ]
  },
  {
    name: 'thanks',
    patterns: [/^(thanks|thank you|cheers|ty|thx|appreciate it)[\s!]*$/i],
    responses: [
      "No problem! What else can I help with? 😊",
      "Happy to help! Got another question?",
      "Anytime! What's next?"
    ]
  },
  {
    name: 'whoami',
    patterns: [/who are you|what are you|what('s| is) your name|are you an ai/i],
    responses: ["I'm **NoteBuddy**, a school assistant AI built to help with your studies. I can help with maths, science, history, geography, English, computer science, and general knowledge. What would you like to know?"]
  },
  {
    name: 'howru',
    patterns: [/how are you|how('re| are) you doing|you ok/i],
    responses: ["I'm doing great, thanks for asking! Ready to help you learn. What subject are you working on? 📚"]
  },
];

// ─────────────────────────────────────────────
//  CONVERSATIONAL CONTEXT
// ─────────────────────────────────────────────
function getConversationContext(history) {
  if (!history || history.length < 2) return null;
  // Look at last AI response to understand context
  const lastAI = [...history].reverse().find(m => m.role === 'model');
  return lastAI ? lastAI.parts[0].text : null;
}

function handleFollowUp(q, context) {
  const lower = q.toLowerCase().trim();

  if (/^(yes|yep|yeah|sure|ok|okay|go on|continue|more|tell me more|elaborate)[\s?!]*$/i.test(lower)) {
    return "Could you be a bit more specific about what you'd like to know more about? I want to make sure I give you the right information! 😊";
  }

  if (/^(no|nope|nah|never mind|that'?s? (ok|fine|alright))[\s!.]*$/i.test(lower)) {
    return "No worries! What else can I help you with?";
  }

  if (/^(why|how come|explain that|what do you mean)[\s?!]*$/i.test(lower)) {
    return "I'd love to explain further! Could you tell me specifically what part you'd like me to clarify?";
  }

  return null;
}

// ─────────────────────────────────────────────
//  WIKIPEDIA SCRAPER
// ─────────────────────────────────────────────
async function searchWikipedia(query) {
  try {
    // Use Wikipedia's open API — no key needed, completely free
    const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/\s+/g, '_'))}`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'NoteBuddy/1.0 (school assistant)' },
      signal: AbortSignal.timeout(5000)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.extract && data.extract.length > 50) {
        const title = data.title;
        const extract = data.extract.slice(0, 600);
        const url = data.content_urls?.desktop?.page || '';
        return `**${title}**\n\n${extract}${data.extract.length > 600 ? '...' : ''}\n\n*Source: Wikipedia*${url ? ` — [Read more](${url})` : ''}`;
      }
    }

    // Fallback: search endpoint
    const searchFallback = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=1`;
    const res2 = await fetch(searchFallback, { signal: AbortSignal.timeout(5000) });
    if (res2.ok) {
      const data2 = await res2.json();
      const results = data2?.query?.search;
      if (results && results.length > 0) {
        const top = results[0];
        const snippet = top.snippet.replace(/<[^>]+>/g, ''); // strip HTML
        return `**${top.title}**\n\n${snippet}...\n\n*Source: Wikipedia*`;
      }
    }
  } catch (e) {
    // Timeout or network error — fail silently
  }
  return null;
}

// ─────────────────────────────────────────────
//  DUCKDUCKGO INSTANT ANSWER
// ─────────────────────────────────────────────
async function searchDDG(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();

    if (data.AbstractText && data.AbstractText.length > 30) {
      return `${data.AbstractText}\n\n*Source: ${data.AbstractSource || 'DuckDuckGo'}*`;
    }
    if (data.Answer) {
      return `**Answer:** ${data.Answer}`;
    }
    if (data.Definition) {
      return `**Definition:** ${data.Definition}\n\n*Source: ${data.DefinitionSource}*`;
    }
    // Related topics
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      const topics = data.RelatedTopics
        .filter(t => t.Text)
        .slice(0, 3)
        .map(t => `- ${t.Text}`)
        .join('\n');
      if (topics) return `Here's what I found:\n\n${topics}`;
    }
  } catch (_) {}
  return null;
}

// ─────────────────────────────────────────────
//  SUBJECT DETECTION
// ─────────────────────────────────────────────
function detectSubject(q) {
  const lower = q.toLowerCase();
  if (/\d+|\bmath|calcul|equat|formula|percent|fraction|decimal|algebra|geometr|trigon|pythagor|quadrat|integr|derivat|sqrt|factorial|prime|mean|median|mode/i.test(q)) return 'maths';
  if (/\bhistor|war|king|queen|battle|empire|revolut|ancient|century|bc\b|ad\b|medieval|tudor|victorian|century/i.test(lower)) return 'history';
  if (/\bgeograph|climat|country|continent|capital|river|mountain|ocean|sea\b|plate|tecton|weather|biome|ecosystem/i.test(lower)) return 'geography';
  if (/\bphysics|chemistry|biology|cell|organ|dna|gene|atom|molecule|element|compound|react|force|energy|wave|electric|magnet|nuclear|periodic|photosyn|osmosis|mitosis|meiosis|evolut/i.test(lower)) return 'science';
  if (/\benglish|poem|poet|novel|author|write|grammar|metaphor|simile|alliter|literary|character|narrative|theme|tone|voice|iambic|sonnet|shakespeare/i.test(lower)) return 'english';
  if (/\bcode|program|algorithm|binary|computer|cpu|ram|software|hardware|python|javascript|java|oop|class|function|array|loop|variable|sorting|search/i.test(lower)) return 'cs';
  return 'general';
}

// ─────────────────────────────────────────────
//  MAIN ENGINE
// ─────────────────────────────────────────────
export async function engine(question, history = []) {
  const q = question.trim();
  const lower = q.toLowerCase().replace(/[?!.]+$/, '').trim();

  // 1. Intent detection (greetings etc)
  for (const intent of INTENTS) {
    if (intent.patterns.some(p => p.test(lower))) {
      const responses = intent.responses;
      return responses[Math.floor(Math.random() * responses.length)];
    }
  }

  // 2. Follow-up handling
  const context = getConversationContext(history);
  const followUp = handleFollowUp(q, context);
  if (followUp) return followUp;

  // 3. Maths engine
  const mathResult = tryMaths(lower);
  if (mathResult) return mathResult;

  // 4. Knowledge base (fuzzy match)
  const kbKeys = Object.keys(KB);
  let bestMatch = null, bestScore = 0;

  for (const key of kbKeys) {
    const keyWords = key.split(' ');
    const queryWords = lower.split(' ');
    const matches = keyWords.filter(w => queryWords.includes(w)).length;
    const score = matches / keyWords.length;
    if (score > bestScore && score >= 0.6) {
      bestScore = score;
      bestMatch = key;
    }
  }

  if (bestMatch) return KB[bestMatch];

  // 5. Detect subject and do targeted Wikipedia search
  const subject = detectSubject(q);

  // Clean query for web search
  const cleanQ = q
    .replace(/^(what is|what are|who is|who was|when did|where is|how does|explain|define|tell me about)\s+/i, '')
    .replace(/[?!.]+$/, '')
    .trim();

  // Try DuckDuckGo instant answer first (faster)
  const ddgResult = await searchDDG(cleanQ);
  if (ddgResult && ddgResult.length > 80) {
    return `${ddgResult}\n\n---\n*💡 Ask me to explain further or give examples!*`;
  }

  // Try Wikipedia
  const wikiResult = await searchWikipedia(cleanQ);
  if (wikiResult) {
    return `${wikiResult}\n\n---\n*💡 Ask me to explain further or give examples!*`;
  }

  // 6. Subject-specific fallbacks
  const fallbacks = {
    maths:   `I can help with that maths question! Could you rephrase it? For example:\n- "What is 25% of 340?"\n- "Solve 2x² + 5x + 3 = 0"\n- "Area of a circle with radius 7"\n- "Is 97 a prime number?"`,
    science: `That's a science question I don't have in my knowledge base. Try rephrasing, or ask something like "What is photosynthesis?" or "Explain Newton's laws."`,
    history: `I can help with history! Try asking something like "When did World War 2 start?" or "Who was Henry VIII?"`,
    english: `For English questions, try asking about specific techniques like "What is a metaphor?" or "What is alliteration?"`,
    cs:      `For computer science, try "What is an algorithm?", "What is binary?", or "What is OOP?"`,
    geography: `For geography, try "What is the water cycle?" or "What is plate tectonics?"`,
    general: `I couldn't find a specific answer to that. Try rephrasing your question, or ask about a specific school subject!`
  };

  return fallbacks[subject] || fallbacks.general;
}
