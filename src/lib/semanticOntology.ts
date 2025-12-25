import type { SemanticOntologyTag, SemanticOntologyTagKind } from './db';

export const SEMANTIC_ANALYSIS_VERSION = 1;
export const DEFAULT_EMBED_MODEL_ID = 'llama.cpp-embed-gguf-v1';

type OntologySeed = Omit<SemanticOntologyTag, 'createdAt' | 'updatedAt'>;

function tag(id: string, name: string, kind: SemanticOntologyTagKind, description: string, parentId?: string, aliases?: string[]): OntologySeed {
  return { id, name, kind, description, parentId, aliases };
}

export const MATH_ONTOLOGY_SEED: OntologySeed[] = [
  tag('subject.mathematics', 'Mathematics', 'topic', 'Problems involving numbers, algebra, geometry, calculus, probability, and quantitative reasoning.'),
  tag('subject.physics', 'Physics', 'topic', 'Problems about motion, forces, energy, waves, electricity, magnetism, and physical laws.'),
  tag('subject.chemistry', 'Chemistry', 'topic', 'Problems about matter, atoms, molecules, reactions, stoichiometry, bonding, and chemical properties.'),
  tag('subject.biology', 'Biology', 'topic', 'Questions about living organisms: cells, genetics, evolution, physiology, ecology, and life processes.'),
  tag('subject.english', 'English', 'topic', 'Language, grammar, comprehension, writing skills, vocabulary, and literary analysis.'),
  tag('subject.history', 'History', 'topic', 'Questions about historical periods, events, causes, consequences, and chronology.'),
  tag('subject.evs', 'EVS', 'topic', 'Environmental studies: ecosystems, resources, health, hygiene, community, and sustainability.'),
  tag('subject.social_science', 'Social Science', 'topic', 'Civics, geography, economics, and society: institutions, maps, resources, and human systems.'),

  tag('topic.arithmetic', 'Arithmetic', 'topic', 'Foundational numerical computation with integers, fractions, decimals, and ratios.', 'subject.mathematics'),
  tag('subtopic.fractions', 'Fractions', 'subtopic', 'Manipulating and reasoning about fractions, equivalent forms, and operations on fractions.', 'topic.arithmetic', ['rational numbers']),
  tag('subtopic.percent', 'Percentages', 'subtopic', 'Percent representation, conversions, and applications like discount, growth, and comparison.', 'topic.arithmetic', ['percent']),
  tag('subtopic.ratio', 'Ratio & Proportion', 'subtopic', 'Comparisons using ratios, proportional reasoning, scaling, and unit rate.', 'topic.arithmetic', ['proportion']),

  tag('topic.algebra', 'Algebra', 'topic', 'Symbolic manipulation, expressions, equations, and relationships between quantities.', 'subject.mathematics'),
  tag('subtopic.linear', 'Linear Equations', 'subtopic', 'Solving and interpreting linear equations and inequalities in one or more variables.', 'topic.algebra', ['linear inequality']),
  tag('subtopic.quadratic', 'Quadratic Equations', 'subtopic', 'Solving quadratics by factoring, completing the square, and formula; analyzing roots and graphs.', 'topic.algebra'),
  tag('subtopic.polynomials', 'Polynomials', 'subtopic', 'Operations on polynomials including factoring, identities, division, and degree reasoning.', 'topic.algebra', ['factorization']),
  tag('subtopic.functions', 'Functions', 'subtopic', 'Understanding function definitions, domain/range, composition, inverses, and transformations.', 'topic.algebra'),

  tag('topic.geometry', 'Geometry', 'topic', 'Shapes, measurements, properties of figures, and geometric reasoning.', 'subject.mathematics'),
  tag('subtopic.triangles', 'Triangles', 'subtopic', 'Triangle properties, congruence, similarity, and trigonometric/metric relationships.', 'topic.geometry'),
  tag('subtopic.circles', 'Circles', 'subtopic', 'Circle theorems, chords, tangents, angles, arcs, and circle equations.', 'topic.geometry'),
  tag('subtopic.coordinate', 'Coordinate Geometry', 'subtopic', 'Geometry using coordinate systems: distance, slope, lines, curves, and loci.', 'topic.geometry', ['analytic geometry']),

  tag('topic.trigonometry', 'Trigonometry', 'topic', 'Trigonometric functions, identities, equations, and applications to angles and periodic behavior.', 'subject.mathematics'),
  tag('subtopic.trig-identities', 'Trig Identities', 'subtopic', 'Using and transforming trigonometric identities to simplify or solve expressions.', 'topic.trigonometry'),

  tag('topic.calculus', 'Calculus', 'topic', 'Limits, derivatives, integrals, and reasoning about change and accumulation.', 'subject.mathematics'),
  tag('subtopic.derivatives', 'Derivatives', 'subtopic', 'Differentiation rules, interpretation as rate of change, and applications like optimization.', 'topic.calculus'),
  tag('subtopic.integrals', 'Integrals', 'subtopic', 'Integration techniques, areas/accumulation, and fundamental theorem applications.', 'topic.calculus'),

  tag('topic.probability', 'Probability', 'topic', 'Quantifying uncertainty with events, sample spaces, counting, and probabilistic reasoning.', 'subject.mathematics'),
  tag('topic.statistics', 'Statistics', 'topic', 'Describing and inferring from data using measures, distributions, and models.', 'subject.mathematics'),

  tag('topic.physics.mechanics', 'Mechanics', 'topic', 'Motion, forces, Newton’s laws, work-energy, momentum, and rotational dynamics.', 'subject.physics'),
  tag('topic.physics.electricity', 'Electricity & Magnetism', 'topic', 'Charge, current, circuits, fields, potential, magnetism, and electromagnetic induction.', 'subject.physics'),
  tag('topic.physics.waves', 'Waves & Optics', 'topic', 'Wave properties, sound, light, reflection, refraction, lenses, and interference.', 'subject.physics'),

  tag('topic.chem.atomic', 'Atomic Structure', 'topic', 'Atoms, subatomic particles, electron configuration, periodicity, and atomic models.', 'subject.chemistry'),
  tag('topic.chem.bonding', 'Chemical Bonding', 'topic', 'Ionic/covalent bonding, structure, polarity, intermolecular forces, and bonding models.', 'subject.chemistry'),
  tag('topic.chem.stoichiometry', 'Stoichiometry', 'topic', 'Moles, balanced equations, limiting reagent, concentration, and quantitative reaction calculations.', 'subject.chemistry'),

  tag('topic.bio.cell', 'Cell Biology', 'topic', 'Cells, organelles, membranes, transport, and basic cellular processes.', 'subject.biology'),
  tag('topic.bio.genetics', 'Genetics', 'topic', 'Inheritance, DNA/RNA, Mendelian patterns, mutation, and genetic variation.', 'subject.biology'),
  tag('topic.bio.ecology', 'Ecology', 'topic', 'Ecosystems, food chains/webs, biodiversity, population, and environmental interactions.', 'subject.biology'),

  tag('topic.eng.grammar', 'Grammar', 'topic', 'Parts of speech, sentence structure, tenses, agreement, and punctuation rules.', 'subject.english'),
  tag('topic.eng.comprehension', 'Reading Comprehension', 'topic', 'Understanding passages, inference, main idea, tone, and evidence-based answers.', 'subject.english'),
  tag('topic.eng.vocab', 'Vocabulary', 'topic', 'Word meaning, usage, synonyms/antonyms, and context-based word choice.', 'subject.english'),

  tag('topic.history.ancient', 'Ancient History', 'topic', 'Early civilizations, empires, timelines, and foundational historical developments.', 'subject.history'),
  tag('topic.history.modern', 'Modern History', 'topic', 'Modern periods, movements, colonization, independence, and key global events.', 'subject.history'),

  tag('topic.evs.environment', 'Environment', 'topic', 'Natural resources, pollution, conservation, climate, and sustainability practices.', 'subject.evs'),
  tag('topic.evs.health', 'Health & Hygiene', 'topic', 'Nutrition, disease prevention, personal hygiene, and public health basics.', 'subject.evs'),

  tag('topic.ss.geography', 'Geography', 'topic', 'Maps, landforms, climate, resources, population, and spatial human-environment systems.', 'subject.social_science'),
  tag('topic.ss.civics', 'Civics', 'topic', 'Government, constitution, rights/duties, institutions, and civic processes.', 'subject.social_science'),
  tag('topic.ss.economics', 'Economics', 'topic', 'Production, consumption, markets, money, basic economic reasoning, and development.', 'subject.social_science'),

  tag('skill.symbolic-manipulation', 'Symbolic Manipulation', 'skill', 'Algebraic rearrangement, simplification, substitution, and transformation of symbolic expressions.'),
  tag('skill.conceptual-reasoning', 'Conceptual Reasoning', 'skill', 'Explaining or proving relationships, interpreting meaning, and reasoning beyond computation.'),
  tag('skill.procedural-execution', 'Procedural Execution', 'skill', 'Executing a known method or algorithmic procedure with accuracy and speed.'),
  tag('skill.multi-step-reasoning', 'Multi-step Reasoning', 'skill', 'Solving problems requiring multiple dependent reasoning steps and intermediate results.'),

  tag('operation.simplify', 'Simplify', 'operation', 'Reducing an expression to an equivalent simpler form.'),
  tag('operation.solve', 'Solve', 'operation', 'Finding values satisfying equations, inequalities, or constraints.'),
  tag('operation.prove', 'Prove/Justify', 'operation', 'Providing a logical argument establishing a statement.'),
  tag('operation.compute', 'Compute', 'operation', 'Carrying out calculations to obtain a numeric or symbolic result.'),
];

export function getOntologySeedWithTimestamps(now: number): SemanticOntologyTag[] {
  return MATH_ONTOLOGY_SEED.map((t) => ({
    ...t,
    createdAt: now,
    updatedAt: now,
  }));
}
