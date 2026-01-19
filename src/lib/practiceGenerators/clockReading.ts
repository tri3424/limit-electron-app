import type { PracticeDifficulty } from '@/lib/practiceEngine';

type ClockReadingVariantId =
  | 'read_time'
  | 'end_time_ampm'
  | 'end_time_24h'
  | 'duration_hm'
  | 'duration_minutes';

type ClockAnswerKind = 'time_12_no_ampm' | 'time_12_ampm' | 'time_24' | 'duration_hm' | 'duration_minutes';

type GraphPracticeQuestionBase = {
  kind: 'graph';
  id: string;
  topicId: 'clock_reading';
  difficulty: PracticeDifficulty;
  seed: number;
  katexQuestion: string;
  promptText: string;
  promptKatex?: string;
  katexOptions?: string[];
  correctIndex?: number;
  inputFields?: Array<{ id: string; label: string; kind: 'text' | 'number' }>; // Practice UI uses these to show inputs
  graphSpec?: any;
  secondaryGraphSpec?: any;
  svgDataUrl: string;
  svgAltText: string;
  generatorParams: Record<string, any>;
  katexExplanation: {
    steps: Array<{ katex: string; text: string }>;
    summary: string;
    commonMistake?: { katex: string; text: string };
  };
  hints?: Array<{ katex: string; text: string }>;
};

type Rng = {
  next: () => number;
  int: (min: number, max: number) => number;
};

function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  const next = () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return lo + Math.floor(next() * (hi - lo + 1));
  };
  return { next, int };
}

function pad2(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

function minutesToDurationText(totalMin: number) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h} hour${h === 1 ? '' : 's'} ${m} minute${m === 1 ? '' : 's'}`;
  if (h > 0) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${m} minute${m === 1 ? '' : 's'}`;
}

function to12h(h24: number) {
  const h = ((h24 % 12) + 12) % 12;
  return h === 0 ? 12 : h;
}

function ampmOfHour(h24: number): 'AM' | 'PM' {
  return h24 % 24 < 12 ? 'AM' : 'PM';
}

function buildClockSvg(opts: {
  hour12: number;
  minute: number;
  size?: number;
}) {
  const size = opts.size ?? 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;

  const minute = ((opts.minute % 60) + 60) % 60;
  const hour12 = ((opts.hour12 - 1) % 12) + 1;

  // Angles: 12 o'clock is -90deg
  const minuteAngle = (minute / 60) * 360 - 90;
  const hourAngle = ((hour12 % 12) / 12) * 360 + (minute / 60) * 30 - 90;

  const rad = (deg: number) => (deg * Math.PI) / 180;

  const lineEnd = (angleDeg: number, length: number) => {
    const a = rad(angleDeg);
    return {
      x: cx + Math.cos(a) * length,
      y: cy + Math.sin(a) * length,
    };
  };

  const tickLines: string[] = [];
  for (let i = 0; i < 60; i++) {
    const a = i * 6 - 90;
    const isHourTick = i % 5 === 0;
    const outer = r;
    const inner = r - (isHourTick ? r * 0.12 : r * 0.06);
    const p1 = lineEnd(a, inner);
    const p2 = lineEnd(a, outer);
    const w = isHourTick ? 2.2 : 1.2;
    tickLines.push(
      `<line x1="${p1.x.toFixed(2)}" y1="${p1.y.toFixed(2)}" x2="${p2.x.toFixed(2)}" y2="${p2.y.toFixed(2)}" stroke="#111827" stroke-width="${w}" stroke-linecap="round" opacity="${isHourTick ? 0.9 : 0.45}" />`,
    );
  }

  const numbers: string[] = [];
  for (let n = 1; n <= 12; n++) {
    const a = (n / 12) * 360 - 90;
    const pos = lineEnd(a, r * 0.78);
    numbers.push(
      `<text x="${pos.x.toFixed(2)}" y="${pos.y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-family="Roboto Slab, ui-serif, Georgia, serif" font-size="${(size * 0.07).toFixed(2)}" fill="#111827">${n}</text>`,
    );
  }

  const hourEnd = lineEnd(hourAngle, r * 0.55);
  const minuteEnd = lineEnd(minuteAngle, r * 0.78);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${cx}" cy="${cy}" r="${(r + 6).toFixed(2)}" fill="#ffffff" stroke="#111827" stroke-width="2" />
  ${tickLines.join('\n  ')}
  ${numbers.join('\n  ')}
  <line x1="${cx}" y1="${cy}" x2="${hourEnd.x.toFixed(2)}" y2="${hourEnd.y.toFixed(2)}" stroke="#111827" stroke-width="4" stroke-linecap="round" />
  <line x1="${cx}" y1="${cy}" x2="${minuteEnd.x.toFixed(2)}" y2="${minuteEnd.y.toFixed(2)}" stroke="#111827" stroke-width="3" stroke-linecap="round" />
  <circle cx="${cx}" cy="${cy}" r="4" fill="#111827" />
</svg>`;
}

function buildTwoClocksSvg(a: { hour12: number; minute: number; label: string }, b: { hour12: number; minute: number; label: string }) {
  const size = 220;
  const gap = 24;
  const width = size * 2 + gap;
  const labelSpace = 30;
  const height = size + labelSpace;

  const svgA = buildClockSvg({ hour12: a.hour12, minute: a.minute, size })
    .replace(/^<\?xml[^>]*>\s*/i, '')
    .replace(/^\s*<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '');
  const svgB = buildClockSvg({ hour12: b.hour12, minute: b.minute, size })
    .replace(/^<\?xml[^>]*>\s*/i, '')
    .replace(/^\s*<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <g transform="translate(0,0)">${svgA}</g>
  <g transform="translate(${size + gap},0)">${svgB}</g>
  <text x="${(size / 2).toFixed(2)}" y="${(size + 22).toFixed(2)}" text-anchor="middle" font-family="Roboto Slab, ui-serif, Georgia, serif" font-size="16" fill="#374151">${a.label}</text>
  <text x="${(size + gap + size / 2).toFixed(2)}" y="${(size + 22).toFixed(2)}" text-anchor="middle" font-family="Roboto Slab, ui-serif, Georgia, serif" font-size="16" fill="#374151">${b.label}</text>
</svg>`;
}

function pickVariant(rng: Rng, weights: Record<string, number> | undefined): ClockReadingVariantId {
  const defaults: Record<ClockReadingVariantId, number> = {
    read_time: 35,
    end_time_ampm: 25,
    end_time_24h: 20,
    duration_hm: 10,
    duration_minutes: 10,
  };

  const entries = Object.keys(defaults) as ClockReadingVariantId[];
  const w = (k: ClockReadingVariantId) => {
    const v0 = typeof (weights as any)?.[k] === 'number' ? Number((weights as any)[k]) : defaults[k];
    return Math.max(0, v0);
  };
  const total = entries.reduce((s, k) => s + w(k), 0);
  if (total <= 0) return 'read_time';
  const pick = rng.next() * total;
  let acc = 0;
  for (const k of entries) {
    acc += w(k);
    if (pick <= acc) return k;
  }
  return entries[entries.length - 1]!;
}

function pickMinute(rng: Rng, difficulty: PracticeDifficulty) {
  if (difficulty === 'easy') {
    const options = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
    return options[rng.int(0, options.length - 1)]!;
  }
  if (difficulty === 'medium') {
    // multiples of 5 plus a few off-by-1 minutes
    const base = rng.int(0, 11) * 5;
    const jitter = rng.int(0, 3) === 0 ? rng.int(-2, 2) : 0;
    return ((base + jitter) % 60 + 60) % 60;
  }
  return rng.int(0, 59);
}

function pickDurationMinutes(rng: Rng, difficulty: PracticeDifficulty) {
  if (difficulty === 'easy') {
    const mins = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 105, 120];
    return mins[rng.int(0, mins.length - 1)]!;
  }
  if (difficulty === 'medium') {
    const mins = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120, 135, 150, 165];
    return mins[rng.int(0, mins.length - 1)]!;
  }
  return rng.int(5, 240);
}

function formatDurationForPrompt(totalMin: number) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h} hour${h === 1 ? '' : 's'} and ${m} minute${m === 1 ? '' : 's'}`;
  if (h > 0) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${m} minute${m === 1 ? '' : 's'}`;
}

export function generateClockReadingQuestion(input: {
  seed: number;
  difficulty: PracticeDifficulty;
  variantWeights?: Record<string, number>;
  avoidVariantId?: string;
}): GraphPracticeQuestionBase {
  const rng = mulberry32((input.seed ^ 0x7f4a7c15) >>> 0);
  const variantId0 = pickVariant(rng, input.variantWeights);
  const variantId = variantId0 === (input.avoidVariantId as any)
    ? pickVariant(rng, { ...(input.variantWeights ?? {}), [variantId0]: 0 })
    : variantId0;

  const minute = pickMinute(rng, input.difficulty);
  const durationMin = pickDurationMinutes(rng, input.difficulty);

  const commonMeta = {
    kind: variantId,
    variantId,
    topicLabel: 'Clock Reading',
  };

  if (variantId === 'read_time') {
    const hour12 = rng.int(1, 12);
    const svg = buildClockSvg({ hour12, minute });
    const expected = { hour: hour12, minute };

    const promptText = `Look at the clock shown above. What time is it? Write your answer in hours : minutes.`;

    const explanationSteps = [
      {
        katex: String.raw`\text{Read the minute hand first}`,
        text: `The long (minute) hand points to the minutes. Count the small ticks from 12. Here it shows ${expected.minute} minute${expected.minute === 1 ? '' : 's'}.`,
      },
      {
        katex: String.raw`\text{Then read the hour hand}`,
        text: `The short (hour) hand tells the hour. Here it is at ${expected.hour}.`,
      },
      {
        katex: String.raw`\text{Combine them}`,
        text: `So the time is ${expected.hour}:${pad2(expected.minute)}.`,
      },
    ];

    return {
      kind: 'graph',
      id: `clock-${input.seed}-read-${hour12}-${minute}`,
      topicId: 'clock_reading',
      difficulty: input.difficulty,
      seed: input.seed,
      katexQuestion: '',
      promptText,
      svgDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      svgAltText: `An analog clock showing ${expected.hour}:${pad2(expected.minute)}.`,
      generatorParams: {
        ...commonMeta,
        answerKind: 'time_12_no_ampm' satisfies ClockAnswerKind,
        expectedHour: expected.hour,
        expectedMinute: expected.minute,
      },
      inputFields: [
        { id: 'h', label: 'Hour', kind: 'number' },
        { id: 'm', label: 'Minute', kind: 'number' },
      ],
      katexExplanation: {
        steps: explanationSteps,
        summary: `Minute hand → ${expected.minute} minute${expected.minute === 1 ? '' : 's'}, hour hand → ${expected.hour}. Final answer: ${expected.hour}:${pad2(expected.minute)}.`,
        commonMistake: {
          katex: String.raw`\text{Common mistake}`,
          text: `Mixing up the hands. The minute hand is longer; the hour hand is shorter and moves slowly between numbers.`,
        },
      },
      hints: [
        { katex: String.raw`\text{Hint}` , text: `Count the minute ticks (each small tick is 1 minute).` },
      ],
    };
  }

  if (variantId === 'end_time_ampm') {
    // Avoid day wrap (crossing midnight) to keep the story simple and unambiguous.
    const maxStartH24 = Math.max(0, Math.min(23, Math.floor((24 * 60 - durationMin - 1) / 60)));
    const startH24 = rng.int(0, maxStartH24);
    const startM = pickMinute(rng, input.difficulty);
    const startTotal = startH24 * 60 + startM;
    const endTotal = startTotal + durationMin;
    const endH24 = Math.floor(endTotal / 60);
    const endM = endTotal % 60;

    const startHour12 = to12h(startH24);
    const endHour12 = to12h(endH24);

    const svg = buildClockSvg({ hour12: startHour12, minute: startM });
    const startAmPm = ampmOfHour(startH24);
    const promptText = `An activity started at the time shown on the clock above. Assume this start time is ${startAmPm}. It continued for ${formatDurationForPrompt(durationMin)}. What time did it finish? Write the time in hours : minutes, and choose AM/PM.`;

    const endAmPm = ampmOfHour(endH24);

    const explanationSteps = [
      {
        katex: String.raw`\text{Convert the duration to minutes}`,
        text: `The duration is ${minutesToDurationText(durationMin)} = ${durationMin} minutes.`,
      },
      {
        katex: String.raw`\text{Add minutes to the start time}`,
        text: `Starting from ${startHour12}:${pad2(startM)} (${ampmOfHour(startH24)}), move forward ${durationMin} minutes.`,
      },
      {
        katex: String.raw`\text{Handle hour changes}`,
        text: `When minutes pass 60, carry 60 minutes into 1 hour. Continue until all ${durationMin} minutes are added.`,
      },
      {
        katex: String.raw`\text{Final time}`,
        text: `The activity ends at ${endHour12}:${pad2(endM)} ${endAmPm}.`,
      },
    ];

    return {
      kind: 'graph',
      id: `clock-${input.seed}-end-ampm-${startH24}-${startM}-${durationMin}`,
      topicId: 'clock_reading',
      difficulty: input.difficulty,
      seed: input.seed,
      katexQuestion: '',
      promptText,
      svgDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      svgAltText: `An analog clock showing the start time ${startHour12}:${pad2(startM)}.`,
      generatorParams: {
        ...commonMeta,
        answerKind: 'time_12_ampm' satisfies ClockAnswerKind,
        expectedHour: endHour12,
        expectedMinute: endM,
        expectedAmPm: endAmPm,
      },
      inputFields: [
        { id: 'h', label: 'Hour', kind: 'number' },
        { id: 'm', label: 'Minute', kind: 'number' },
        { id: 'ampm', label: 'AM/PM', kind: 'text' },
      ],
      katexExplanation: {
        steps: explanationSteps,
        summary: `Add ${durationMin} minutes to the start time. Final answer: ${endHour12}:${pad2(endM)} ${endAmPm}.`,
        commonMistake: {
          katex: String.raw`\text{Common mistake}`,
          text: `Forgetting to carry minutes into hours, or forgetting that after 11:59 comes 12:00 and AM/PM may change at 12:00.`,
        },
      },
      hints: [
        { katex: String.raw`\text{Hint}` , text: `Add minutes first; every 60 minutes becomes 1 hour.` },
      ],
    };
  }

  if (variantId === 'end_time_24h') {
    // Avoid day wrap (crossing midnight) unless we explicitly mention dates (we don't).
    const maxStartH24 = Math.max(0, Math.min(23, Math.floor((24 * 60 - durationMin - 1) / 60)));
    const startH24 = rng.int(0, maxStartH24);
    const startM = pickMinute(rng, input.difficulty);
    const startTotal = startH24 * 60 + startM;
    const endTotal = startTotal + durationMin;
    const endH24 = Math.floor(endTotal / 60);
    const endM = endTotal % 60;

    const startHour12 = to12h(startH24);

    const svg = buildClockSvg({ hour12: startHour12, minute: startM });
    const startAmPm = ampmOfHour(startH24);
    const promptText = `The activity began at the time shown on the clock above. Assume this start time is ${startAmPm}. It continued for ${formatDurationForPrompt(durationMin)}. What time did it end? Write the time in 24-hour format (HH : MM).`;

    const explanationSteps = [
      {
        katex: String.raw`\text{Work with 24-hour time}`,
        text: `Because the answer must be in 24-hour format, keep track of the day part (AM/PM) while adding the duration.`,
      },
      {
        katex: String.raw`\text{Add the duration}`,
        text: `Start at ${pad2(startH24)}:${pad2(startM)} and add ${durationMin} minutes.`,
      },
      {
        katex: String.raw`\text{Final time}`,
        text: `The end time is ${pad2(endH24)}:${pad2(endM)}.`,
      },
    ];

    return {
      kind: 'graph',
      id: `clock-${input.seed}-end-24-${startH24}-${startM}-${durationMin}`,
      topicId: 'clock_reading',
      difficulty: input.difficulty,
      seed: input.seed,
      katexQuestion: '',
      promptText,
      svgDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      svgAltText: `An analog clock showing the start time ${startHour12}:${pad2(startM)}.`,
      generatorParams: {
        ...commonMeta,
        answerKind: 'time_24' satisfies ClockAnswerKind,
        expectedHour24: endH24,
        expectedMinute: endM,
      },
      inputFields: [
        { id: 'hh', label: 'Hour (24h)', kind: 'number' },
        { id: 'mm', label: 'Minute', kind: 'number' },
      ],
      katexExplanation: {
        steps: explanationSteps,
        summary: `Final answer (24-hour): ${pad2(endH24)}:${pad2(endM)}.`,
        commonMistake: {
          katex: String.raw`\text{Common mistake}`,
          text: `Writing the 12-hour clock reading instead of converting to 24-hour time (for example, writing 3:20 instead of 15:20).`,
        },
      },
      hints: [
        { katex: String.raw`\text{Hint}` , text: `In 24-hour time, afternoon hours are 13–23.` },
      ],
    };
  }

  // Duration between two clocks
  // Construct a safe same-half-day (AM or PM) window so the duration is unambiguous
  // without having to specify different AM/PM for start vs end.
  const delta = input.difficulty === 'easy' ? rng.int(10, 180) : input.difficulty === 'medium' ? rng.int(15, 240) : rng.int(10, 360);
  const isAm = rng.int(0, 1) === 0;
  const halfStart = isAm ? 0 : 12 * 60;
  const halfEndExclusive = isAm ? 12 * 60 : 24 * 60;

  const latestStartTotal = halfEndExclusive - delta - 1;
  const minStartH24 = isAm ? 6 : 12;
  const maxStartH24 = isAm ? 11 : 23;
  const startM = pickMinute(rng, input.difficulty);

  // Pick an hour, then adjust downward if necessary to ensure start+delta stays in the same half-day.
  let startH24b = rng.int(minStartH24, maxStartH24);
  let startTotalB = startH24b * 60 + startM;
  for (let i = 0; i < 20 && startTotalB > latestStartTotal && startH24b > minStartH24; i++) {
    startH24b -= 1;
    startTotalB = startH24b * 60 + startM;
  }
  if (startTotalB > latestStartTotal) {
    // Fallback: clamp to the latest possible start within this half-day.
    startTotalB = latestStartTotal;
    startH24b = Math.floor(startTotalB / 60);
  }

  const startMbFixed = startTotalB % 60;
  const endTotalB = startTotalB + delta;
  const endH24b = Math.floor(endTotalB / 60);
  const endMb = endTotalB % 60;

  const startHour12b = to12h(startH24b);
  const endHour12b = to12h(endH24b);

  const twoSvg = buildTwoClocksSvg(
    { hour12: startHour12b, minute: startMbFixed, label: 'Start' },
    { hour12: endHour12b, minute: endMb, label: 'End' },
  );

  const amPm = ampmOfHour(startH24b);
  const promptText = `The first clock shows when the activity started, and the second clock shows when it ended. Assume both times are ${amPm}. How long did the activity last?`;

  const durH = Math.floor(delta / 60);
  const durM = delta % 60;

  if (variantId === 'duration_minutes') {
    const explanationSteps = [
      {
        katex: String.raw`\text{Find the difference}`,
        text: `Work forward from the start time to the end time. The total duration is ${delta} minutes.`,
      },
      {
        katex: String.raw`\text{Check using hours and minutes}`,
        text: `That is the same as ${durH} hour${durH === 1 ? '' : 's'} ${durM} minute${durM === 1 ? '' : 's'}.`,
      },
    ];

    return {
      kind: 'graph',
      id: `clock-${input.seed}-dur-min-${startH24b}-${startMbFixed}-${endH24b}-${endMb}`,
      topicId: 'clock_reading',
      difficulty: input.difficulty,
      seed: input.seed,
      katexQuestion: '',
      promptText: `${promptText} Write your answer as total minutes.`,
      svgDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(twoSvg)}`,
      svgAltText: `Two clocks showing start and end times.`,
      generatorParams: {
        ...commonMeta,
        answerKind: 'duration_minutes' satisfies ClockAnswerKind,
        expectedTotalMinutes: delta,
      },
      inputFields: [{ id: 'mins', label: 'Total minutes', kind: 'number' }],
      katexExplanation: {
        steps: explanationSteps,
        summary: `Duration = ${delta} minutes.`,
        commonMistake: {
          katex: String.raw`\text{Common mistake}`,
          text: `Mixing up hours and minutes (for example, writing 2.30 instead of 150 minutes).`,
        },
      },
      hints: [
        { katex: String.raw`\text{Hint}` , text: `Convert hours to minutes: 1 hour = 60 minutes.` },
      ],
    };
  }

  // duration_hm
  const startTime = `${pad2(startH24b)}:${pad2(startMbFixed)}`;
  const endTime = `${pad2(endH24b)}:${pad2(endMb)}`;
  const nextFullHourH24 = (startH24b + (startMbFixed === 0 ? 0 : 1)) % 24;
  const minutesToNextHour = startMbFixed === 0 ? 0 : 60 - startMbFixed;
  const fullHoursBetween = Math.max(0, durH - (minutesToNextHour > 0 ? 1 : 0));

  const explanationSteps = [
    {
      katex: String.raw`\text{Write the times down}`,
      text: `Start = ${startTime} (${amPm}), End = ${endTime} (${amPm}). We want the time difference.`,
    },
    {
      katex: String.raw`\text{Count full hours first}`,
      text:
        minutesToNextHour === 0
          ? `Because the start time is on the hour, we can count full hours directly.`
          : `From ${startTime} to the next full hour is ${minutesToNextHour} minutes.`,
    },
    {
      katex: String.raw`\text{Count full hours}`,
      text:
        durH === 0
          ? `There are no full hours in the duration.`
          : minutesToNextHour === 0
            ? `Full hours = ${durH}.`
            : `After reaching the next hour, count the full hours: ${fullHoursBetween} full hour${fullHoursBetween === 1 ? '' : 's'}.`,
    },
    {
      katex: String.raw`\text{Then count remaining minutes}`,
      text:
        durM === 0
          ? `Remaining minutes = 0.`
          : `Remaining minutes = ${durM} minutes.`,
    },
    {
      katex: String.raw`\text{Combine}`,
      text: `Duration = ${durH} hour${durH === 1 ? '' : 's'} and ${durM} minute${durM === 1 ? '' : 's'}.`,
    },
    {
      katex: String.raw`\text{Convert to minutes (optional check)}`,
      text: `${durH}×60 + ${durM} = ${durH * 60} + ${durM} = ${delta} minutes.`,
    },
  ];

  return {
    kind: 'graph',
    id: `clock-${input.seed}-dur-hm-${startH24b}-${startMbFixed}-${endH24b}-${endMb}`,
    topicId: 'clock_reading',
    difficulty: input.difficulty,
    seed: input.seed,
    katexQuestion: '',
    promptText: `${promptText} Write the duration using hours and minutes.`,
    svgDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(twoSvg)}`,
    svgAltText: `Two clocks showing start and end times.`,
    generatorParams: {
      ...commonMeta,
      answerKind: 'duration_hm' satisfies ClockAnswerKind,
      expectedHours: durH,
      expectedMinutes: durM,
      expectedTotalMinutes: delta,
    },
    inputFields: [
      { id: 'h', label: 'Hours', kind: 'number' },
      { id: 'm', label: 'Minutes', kind: 'number' },
    ],
    katexExplanation: {
      steps: explanationSteps,
      summary: `Duration = ${durH} hour${durH === 1 ? '' : 's'} ${durM} minute${durM === 1 ? '' : 's'} (=${delta} minutes).`,
      commonMistake: {
        katex: String.raw`\text{Common mistake}`,
        text: `Reporting the end time instead of the time difference, or forgetting that 60 minutes makes 1 hour.`,
      },
    },
    hints: [
      { katex: String.raw`\text{Hint}` , text: `Convert the difference to minutes first, then split into hours and minutes.` },
    ],
  };
}
