import type { AreaDistributionItem } from "../config/gridPresets";
import type { GridSizePreset, RectangleRegion } from "../types/rectangleTypes";
import { getActiveAreaDistribution } from "./rectangleAreaDistribution";
import type { RandomSource } from "./seededRandom";

type SplitOrientation = "vertical" | "horizontal";

type AreaCounts = Record<number, number>;

type LeafTemplate = {
  kind: "leaf";
  width: number;
  height: number;
};

type SplitTemplate = {
  kind: "split";
  width: number;
  height: number;
  orientation: SplitOrientation;
  cut: number;
  first: PartitionTemplate;
  second: PartitionTemplate;
};

type PartitionTemplate = LeafTemplate | SplitTemplate;

type PartitionPlan = {
  template: PartitionTemplate;
  areaCounts: AreaCounts;
  distributionPenalty: number;
  signature: string;
};

type SplitOption = {
  orientation: SplitOrientation;
  cut: number;
  firstWidth: number;
  firstHeight: number;
  secondWidth: number;
  secondHeight: number;
  firstLeafCount: number;
  secondLeafCount: number;
  splitScore: number;
};

type SearchContext = {
  minimumRegionArea: number;
  maxRegionArea: number;
  distribution: AreaDistributionItem[];
  targetDistribution: AreaDistributionItem[];
  targetAreaCounts: AreaCounts;
  priorityAreas: number[];
  rootArea: number;
  rootLeafCount: number;
  beamWidth: number;
  maxNodes: number;
  visitedNodes: number;
  reachedNodeLimit: boolean;
  memo: Map<string, PartitionPlan[]>;
  probabilityCache: Map<string, Map<number, number>>;
  random: RandomSource;
};

const MAX_SPLIT_OPTIONS = 28;
const MAX_PLANS_PER_AREA_SIGNATURE = 2;
const MAX_PRIORITY_AREAS = 2;
const RANDOM_SPLIT_NOISE = 0.25;

/**
 * Les aires dont l'espérance est inférieure à 1 sont tirées une fois par
 * grille. 1 signifie que la probabilité de présence reste strictement liée
 * au weight. On peut monter légèrement cette valeur (ex. 1.2) si les aires
 * rares doivent apparaître un peu plus souvent.
 */
const RARE_AREA_PRESENCE_MULTIPLIER = 1;

/**
 * Une petite part des weights d'origine est conservée dans les sous-problèmes
 * afin d'éviter qu'un objectif entier difficile à découper bloque la recherche.
 */
const TARGET_DISTRIBUTION_SMOOTHING = 0.12;

const MAX_REACHABILITY_CACHE_ENTRIES = 20;
const reachabilityCache = new Map<string, Uint8Array[]>();

function getArea(width: number, height: number): number {
  return width * height;
}

function getMinimumRegionArea(allowSingleCellRegions: boolean): number {
  return allowSingleCellRegions ? 1 : 2;
}

function getAspectRatio(width: number, height: number): number {
  const shortestSide = Math.min(width, height);
  const longestSide = Math.max(width, height);

  if (shortestSide <= 0) {
    return 999;
  }

  return longestSide / shortestSide;
}

function getSplitShapeScore(
  firstWidth: number,
  firstHeight: number,
  secondWidth: number,
  secondHeight: number,
): number {
  return (
    getAspectRatio(firstWidth, firstHeight) -
    1 +
    (getAspectRatio(secondWidth, secondHeight) - 1)
  );
}

function getOrientationPenalty(
  parentWidth: number,
  parentHeight: number,
  orientation: SplitOrientation,
): number {
  if (parentWidth > parentHeight) {
    return orientation === "vertical" ? 0 : 0.3;
  }

  if (parentHeight > parentWidth) {
    return orientation === "horizontal" ? 0 : 0.3;
  }

  return 0;
}

function getSplitScore(
  parentWidth: number,
  parentHeight: number,
  orientation: SplitOrientation,
  firstWidth: number,
  firstHeight: number,
  secondWidth: number,
  secondHeight: number,
  firstLeafCount: number,
  secondLeafCount: number,
  totalArea: number,
  random: RandomSource,
): number {
  const firstArea = getArea(firstWidth, firstHeight);
  const secondArea = getArea(secondWidth, secondHeight);

  const leafBalance =
    Math.abs(firstLeafCount - secondLeafCount) /
    Math.max(1, firstLeafCount + secondLeafCount);

  const areaBalance = Math.abs(firstArea - secondArea) / Math.max(1, totalArea);

  const shapeScore = getSplitShapeScore(
    firstWidth,
    firstHeight,
    secondWidth,
    secondHeight,
  );

  const orientationPenalty = getOrientationPenalty(
    parentWidth,
    parentHeight,
    orientation,
  );

  return (
    leafBalance * 1.2 +
    areaBalance * 0.5 +
    shapeScore * 0.25 +
    orientationPenalty +
    random.next() * RANDOM_SPLIT_NOISE
  );
}

function createRegion(
  row: number,
  col: number,
  width: number,
  height: number,
): RectangleRegion {
  return {
    id: -1,
    row,
    col,
    width,
    height,
  };
}

function normalizeRegionIds(regions: RectangleRegion[]): RectangleRegion[] {
  return regions.map((region, index) => ({
    ...region,
    id: index,
  }));
}

function getStateKey(width: number, height: number, leafCount: number): string {
  return `${width}x${height}:${leafCount}`;
}

function getAreaCountsSignature(areaCounts: AreaCounts): string {
  return Object.entries(areaCounts)
    .filter(([, count]) => count > 0)
    .sort(([firstArea], [secondArea]) => Number(firstArea) - Number(secondArea))
    .map(([area, count]) => `${area}:${count}`)
    .join("|");
}

function mergeAreaCounts(first: AreaCounts, second: AreaCounts): AreaCounts {
  const merged: AreaCounts = { ...first };

  for (const [area, count] of Object.entries(second)) {
    const numericArea = Number(area);

    merged[numericArea] = (merged[numericArea] ?? 0) + count;
  }

  return merged;
}

function getProbabilitiesForLambda(
  distribution: AreaDistributionItem[],
  lambda: number,
): {
  probabilities: Map<number, number>;
  averageArea: number;
} {
  const positiveItems = distribution.filter((item) => item.weight > 0);

  if (positiveItems.length === 0) {
    return {
      probabilities: new Map(),
      averageArea: 0,
    };
  }

  const baseArea = positiveItems[0].area;

  const scores = positiveItems.map((item) => ({
    area: item.area,
    score: Math.log(item.weight) + lambda * (item.area - baseArea),
  }));

  const maxScore = Math.max(...scores.map((item) => item.score));

  const normalized = scores.map((item) => ({
    area: item.area,
    value: Math.exp(item.score - maxScore),
  }));

  const total = normalized.reduce((sum, item) => sum + item.value, 0);

  const probabilities = new Map<number, number>();

  let averageArea = 0;

  for (const item of normalized) {
    const probability = item.value / total;

    probabilities.set(item.area, probability);
    averageArea += item.area * probability;
  }

  return {
    probabilities,
    averageArea,
  };
}

/**
 * Les weights bruts ne peuvent pas toujours être respectés tels quels :
 * targetRegionCount impose une aire moyenne précise.
 *
 * Le tilt garde le rapport général des weights tout en visant cette moyenne.
 */
function getTiltedProbabilities(
  distribution: AreaDistributionItem[],
  targetAverageArea: number,
): Map<number, number> {
  const positiveItems = distribution.filter((item) => item.weight > 0);

  if (positiveItems.length === 0) {
    return new Map();
  }

  const minimumArea = Math.min(...positiveItems.map((item) => item.area));
  const maximumArea = Math.max(...positiveItems.map((item) => item.area));

  if (targetAverageArea < minimumArea || targetAverageArea > maximumArea) {
    return new Map();
  }

  let low = -40;
  let high = 40;

  for (let index = 0; index < 28; index++) {
    const middle = (low + high) / 2;

    const { averageArea } = getProbabilitiesForLambda(positiveItems, middle);

    if (averageArea < targetAverageArea) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return getProbabilitiesForLambda(positiveItems, (low + high) / 2)
    .probabilities;
}

function getReachabilityCacheKey(
  areas: number[],
  leafCount: number,
  totalArea: number,
): string {
  return `${areas.join(",")}:${leafCount}:${totalArea}`;
}

/**
 * Table booléenne très légère : table[count][area] vaut 1 lorsqu'il est
 * possible d'atteindre exactement cette aire avec ce nombre de rectangles.
 *
 * Elle ne dépend pas du seed et est donc réutilisée entre plusieurs grilles.
 */
function getReachabilityTable(
  areas: number[],
  leafCount: number,
  totalArea: number,
): Uint8Array[] {
  const cacheKey = getReachabilityCacheKey(areas, leafCount, totalArea);
  const cached = reachabilityCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const table = Array.from(
    { length: leafCount + 1 },
    () => new Uint8Array(totalArea + 1),
  );

  table[0][0] = 1;

  for (let count = 1; count <= leafCount; count++) {
    const previous = table[count - 1];
    const current = table[count];

    for (let currentArea = 0; currentArea <= totalArea; currentArea++) {
      for (const candidateArea of areas) {
        if (
          candidateArea <= currentArea &&
          previous[currentArea - candidateArea] === 1
        ) {
          current[currentArea] = 1;
          break;
        }
      }
    }
  }

  if (reachabilityCache.size >= MAX_REACHABILITY_CACHE_ENTRIES) {
    const oldestKey = reachabilityCache.keys().next().value;

    if (oldestKey !== undefined) {
      reachabilityCache.delete(oldestKey);
    }
  }

  reachabilityCache.set(cacheKey, table);

  return table;
}

function pickWeightedArea(
  candidates: AreaDistributionItem[],
  probabilities: Map<number, number>,
  random: RandomSource,
): number {
  const weightedCandidates = candidates.map((item) => ({
    area: item.area,
    weight: Math.max(probabilities.get(item.area) ?? 0, 0.000_001),
  }));

  const totalWeight = weightedCandidates.reduce(
    (sum, item) => sum + item.weight,
    0,
  );

  let cursor = random.next() * totalWeight;

  for (const item of weightedCandidates) {
    cursor -= item.weight;

    if (cursor <= 0) {
      return item.area;
    }
  }

  return weightedCandidates[weightedCandidates.length - 1].area;
}

/**
 * Construit une cible ENTIÈRE une seule fois pour toute la grille.
 *
 * C'est le point important pour les aires rares : une espérance de 0.10 ne
 * devient plus systématiquement 0. Sur environ 10 grilles, une grille peut
 * réellement viser un rectangle de cette aire.
 *
 * Le remplissage restant utilise une table de faisabilité mise en cache, donc
 * il n'ajoute pas de backtracking supplémentaire à la génération géométrique.
 */
function sampleTargetAreaCounts(
  distribution: AreaDistributionItem[],
  totalArea: number,
  leafCount: number,
  random: RandomSource,
): AreaCounts | null {
  const positiveItems = distribution
    .filter((item) => item.weight > 0)
    .sort((first, second) => first.area - second.area);

  if (positiveItems.length === 0 || leafCount <= 0) {
    return null;
  }

  const probabilities = getTiltedProbabilities(
    positiveItems,
    totalArea / leafCount,
  );

  if (probabilities.size === 0) {
    return null;
  }

  const areas = positiveItems.map((item) => item.area);
  const reachability = getReachabilityTable(areas, leafCount, totalArea);

  if (reachability[leafCount][totalArea] !== 1) {
    return null;
  }

  const counts: AreaCounts = {};
  let remainingCount = leafCount;
  let remainingArea = totalArea;

  /*
   * On traite d'abord les aires à espérance < 1. Le tirage est fait une seule
   * fois par grille et, lorsqu'il réussit, la présence devient un objectif réel.
   * Les plus faibles weights sont testés en premier pour éviter qu'ils soient
   * toujours évincés par les aires communes.
   */
  const rareItems = [...positiveItems]
    .filter((item) => leafCount * (probabilities.get(item.area) ?? 0) < 1)
    .sort(
      (first, second) =>
        first.weight - second.weight || second.area - first.area,
    );

  for (const item of rareItems) {
    if (remainingCount <= 0 || remainingArea < item.area) {
      continue;
    }

    const expectedCount = leafCount * (probabilities.get(item.area) ?? 0);
    const presenceProbability = Math.min(
      1,
      expectedCount * RARE_AREA_PRESENCE_MULTIPLIER,
    );

    if (random.next() >= presenceProbability) {
      continue;
    }

    const nextCount = remainingCount - 1;
    const nextArea = remainingArea - item.area;

    if (nextArea < 0 || reachability[nextCount][nextArea] !== 1) {
      continue;
    }

    counts[item.area] = (counts[item.area] ?? 0) + 1;
    remainingCount = nextCount;
    remainingArea = nextArea;
  }

  while (remainingCount > 0) {
    const feasibleCandidates = positiveItems.filter((item) => {
      const nextArea = remainingArea - item.area;

      return nextArea >= 0 && reachability[remainingCount - 1][nextArea] === 1;
    });

    if (feasibleCandidates.length === 0) {
      return null;
    }

    const selectedArea = pickWeightedArea(
      feasibleCandidates,
      probabilities,
      random,
    );

    counts[selectedArea] = (counts[selectedArea] ?? 0) + 1;
    remainingCount--;
    remainingArea -= selectedArea;
  }

  return remainingArea === 0 ? counts : null;
}

function createTargetDistribution(
  distribution: AreaDistributionItem[],
  targetAreaCounts: AreaCounts,
): AreaDistributionItem[] {
  const maximumOriginalWeight = Math.max(
    1,
    ...distribution.map((item) => item.weight),
  );

  return distribution.map((item) => ({
    ...item,
    weight:
      (targetAreaCounts[item.area] ?? 0) +
      TARGET_DISTRIBUTION_SMOOTHING *
        (Math.max(0, item.weight) / maximumOriginalWeight),
  }));
}

function getExpectedProbabilities(
  area: number,
  leafCount: number,
  context: SearchContext,
): Map<number, number> {
  const key = `${area}:${leafCount}`;
  const cached = context.probabilityCache.get(key);

  if (cached) {
    return cached;
  }

  const probabilities = getTiltedProbabilities(
    context.targetDistribution,
    area / leafCount,
  );

  context.probabilityCache.set(key, probabilities);

  return probabilities;
}

function getRootTargetPenalty(
  areaCounts: AreaCounts,
  context: SearchContext,
): number {
  let penalty = 0;

  for (const item of context.distribution) {
    const targetCount = context.targetAreaCounts[item.area] ?? 0;
    const actualCount = areaCounts[item.area] ?? 0;
    const difference = actualCount - targetCount;

    penalty += (difference * difference) / (targetCount + 0.5);
  }

  const allowedAreas = new Set(context.distribution.map((item) => item.area));

  for (const [area, count] of Object.entries(areaCounts)) {
    if (!allowedAreas.has(Number(area))) {
      penalty += count * 50;
    }
  }

  return penalty;
}

function getDistributionPenalty(
  areaCounts: AreaCounts,
  area: number,
  leafCount: number,
  context: SearchContext,
): number {
  if (area === context.rootArea && leafCount === context.rootLeafCount) {
    return getRootTargetPenalty(areaCounts, context);
  }

  const probabilities = getExpectedProbabilities(area, leafCount, context);

  if (probabilities.size === 0) {
    return Number.POSITIVE_INFINITY;
  }

  let penalty = 0;

  for (const item of context.distribution) {
    const expectedCount = leafCount * (probabilities.get(item.area) ?? 0);
    const actualCount = areaCounts[item.area] ?? 0;
    const difference = actualCount - expectedCount;

    penalty += (difference * difference) / (expectedCount + 0.75);
  }

  for (const [area, count] of Object.entries(areaCounts)) {
    const numericArea = Number(area);

    if (!probabilities.has(numericArea)) {
      penalty += count * 50;
    }
  }

  return penalty;
}

function createPlan(
  template: PartitionTemplate,
  areaCounts: AreaCounts,
  width: number,
  height: number,
  leafCount: number,
  context: SearchContext,
): PartitionPlan {
  return {
    template,
    areaCounts,
    distributionPenalty: getDistributionPenalty(
      areaCounts,
      getArea(width, height),
      leafCount,
      context,
    ),
    signature: getAreaCountsSignature(areaCounts),
  };
}

function selectBeam(
  plans: PartitionPlan[],
  beamWidth: number,
  context: SearchContext,
): PartitionPlan[] {
  const sortedPlans = [...plans].sort(
    (first, second) => first.distributionPenalty - second.distributionPenalty,
  );

  const selectedPlans: PartitionPlan[] = [];
  const selectedSet = new Set<PartitionPlan>();
  const countBySignature = new Map<string, number>();

  const tryAddPlan = (plan: PartitionPlan | undefined): void => {
    if (!plan || selectedSet.has(plan) || selectedPlans.length >= beamWidth) {
      return;
    }

    const currentCount = countBySignature.get(plan.signature) ?? 0;

    if (currentCount >= MAX_PLANS_PER_AREA_SIGNATURE) {
      return;
    }

    selectedPlans.push(plan);
    selectedSet.add(plan);
    countBySignature.set(plan.signature, currentCount + 1);
  };

  tryAddPlan(sortedPlans[0]);

  /*
   * On réserve au maximum deux places aux signatures contenant les aires rares
   * tirées pour cette grille. Cela évite qu'elles disparaissent trop tôt du beam,
   * sans augmenter beamWidth ni le nombre de nœuds visités.
   */
  for (const priorityArea of context.priorityAreas) {
    tryAddPlan(
      sortedPlans.find((plan) => (plan.areaCounts[priorityArea] ?? 0) > 0),
    );
  }

  for (const plan of sortedPlans) {
    tryAddPlan(plan);

    if (selectedPlans.length >= beamWidth) {
      break;
    }
  }

  return selectedPlans;
}

function getCandidateLeafCounts(
  minimum: number,
  maximum: number,
  expected: number,
): number[] {
  if (minimum > maximum) {
    return [];
  }

  const values = new Set<number>();

  values.add(minimum);
  values.add(maximum);

  for (let distance = 0; distance <= 3; distance++) {
    values.add(expected - distance);
    values.add(expected + distance);
  }

  return [...values]
    .filter((value) => value >= minimum && value <= maximum)
    .sort(
      (first, second) =>
        Math.abs(first - expected) - Math.abs(second - expected),
    );
}

function getSplitOptions(
  width: number,
  height: number,
  leafCount: number,
  context: SearchContext,
): SplitOption[] {
  const options: SplitOption[] = [];
  const totalArea = getArea(width, height);

  const addSplitOptions = (
    orientation: SplitOrientation,
    cut: number,
  ): void => {
    const firstWidth = orientation === "vertical" ? cut : width;
    const firstHeight = orientation === "horizontal" ? cut : height;

    const secondWidth = orientation === "vertical" ? width - cut : width;
    const secondHeight = orientation === "horizontal" ? height - cut : height;

    const firstArea = getArea(firstWidth, firstHeight);
    const secondArea = getArea(secondWidth, secondHeight);

    const minimumFirstLeafCount = Math.max(
      1,
      Math.ceil(firstArea / context.maxRegionArea),
      leafCount - Math.floor(secondArea / context.minimumRegionArea),
    );

    const maximumFirstLeafCount = Math.min(
      leafCount - 1,
      Math.floor(firstArea / context.minimumRegionArea),
      leafCount - Math.ceil(secondArea / context.maxRegionArea),
    );

    if (minimumFirstLeafCount > maximumFirstLeafCount) {
      return;
    }

    const expectedFirstLeafCount = Math.round(
      (firstArea / totalArea) * leafCount,
    );

    const candidateLeafCounts = getCandidateLeafCounts(
      minimumFirstLeafCount,
      maximumFirstLeafCount,
      expectedFirstLeafCount,
    );

    for (const firstLeafCount of candidateLeafCounts) {
      const secondLeafCount = leafCount - firstLeafCount;

      options.push({
        orientation,
        cut,
        firstWidth,
        firstHeight,
        secondWidth,
        secondHeight,
        firstLeafCount,
        secondLeafCount,
        splitScore: getSplitScore(
          width,
          height,
          orientation,
          firstWidth,
          firstHeight,
          secondWidth,
          secondHeight,
          firstLeafCount,
          secondLeafCount,
          totalArea,
          context.random,
        ),
      });
    }
  };

  for (let cut = 1; cut < width; cut++) {
    addSplitOptions("vertical", cut);
  }

  for (let cut = 1; cut < height; cut++) {
    addSplitOptions("horizontal", cut);
  }

  return options
    .sort((first, second) => first.splitScore - second.splitScore)
    .slice(0, MAX_SPLIT_OPTIONS);
}

function solvePlans(
  width: number,
  height: number,
  leafCount: number,
  context: SearchContext,
): PartitionPlan[] {
  const area = getArea(width, height);

  if (
    area < leafCount * context.minimumRegionArea ||
    area > leafCount * context.maxRegionArea
  ) {
    return [];
  }

  const stateKey = getStateKey(width, height, leafCount);
  const memoizedPlans = context.memo.get(stateKey);

  if (memoizedPlans) {
    return memoizedPlans;
  }

  if (context.visitedNodes >= context.maxNodes) {
    context.reachedNodeLimit = true;

    return [];
  }

  context.visitedNodes++;

  if (leafCount === 1) {
    if (area < context.minimumRegionArea || area > context.maxRegionArea) {
      return [];
    }

    const result = [
      createPlan(
        {
          kind: "leaf",
          width,
          height,
        },
        {
          [area]: 1,
        },
        width,
        height,
        1,
        context,
      ),
    ];

    context.memo.set(stateKey, result);

    return result;
  }

  const splitOptions = getSplitOptions(width, height, leafCount, context);

  let candidates: PartitionPlan[] = [];

  for (const splitOption of splitOptions) {
    const firstPlans = solvePlans(
      splitOption.firstWidth,
      splitOption.firstHeight,
      splitOption.firstLeafCount,
      context,
    );

    if (firstPlans.length === 0) {
      continue;
    }

    const secondPlans = solvePlans(
      splitOption.secondWidth,
      splitOption.secondHeight,
      splitOption.secondLeafCount,
      context,
    );

    if (secondPlans.length === 0) {
      continue;
    }

    const childPlanLimit = Math.min(3, context.beamWidth);

    for (const firstPlan of firstPlans.slice(0, childPlanLimit)) {
      for (const secondPlan of secondPlans.slice(0, childPlanLimit)) {
        const areaCounts = mergeAreaCounts(
          firstPlan.areaCounts,
          secondPlan.areaCounts,
        );

        candidates.push(
          createPlan(
            {
              kind: "split",
              width,
              height,
              orientation: splitOption.orientation,
              cut: splitOption.cut,
              first: firstPlan.template,
              second: secondPlan.template,
            },
            areaCounts,
            width,
            height,
            leafCount,
            context,
          ),
        );
      }
    }

    if (candidates.length > context.beamWidth * 10) {
      candidates = selectBeam(candidates, context.beamWidth, context);
    }

    if (context.reachedNodeLimit) {
      break;
    }
  }

  const result = selectBeam(candidates, context.beamWidth, context);

  if (!context.reachedNodeLimit) {
    context.memo.set(stateKey, result);
  }

  return result;
}

function materializeTemplate(
  template: PartitionTemplate,
  row: number,
  col: number,
  regions: RectangleRegion[],
): void {
  if (template.kind === "leaf") {
    regions.push(createRegion(row, col, template.width, template.height));

    return;
  }

  materializeTemplate(template.first, row, col, regions);

  if (template.orientation === "vertical") {
    materializeTemplate(template.second, row, col + template.cut, regions);

    return;
  }

  materializeTemplate(template.second, row + template.cut, col, regions);
}

function getTargetRegionCounts(
  rows: number,
  cols: number,
  maxRegionArea: number,
  allowSingleCellRegions: boolean,
  minimumTargetRegionCount: number,
  maximumTargetRegionCount: number,
  random: RandomSource,
): number[] {
  const totalArea = rows * cols;
  const minimumArea = getMinimumRegionArea(allowSingleCellRegions);

  const minimumPossibleCount = Math.ceil(totalArea / maxRegionArea);

  const maximumPossibleCount = Math.floor(totalArea / minimumArea);

  const safeMinimum = Math.max(minimumTargetRegionCount, minimumPossibleCount);

  const safeMaximum = Math.min(maximumTargetRegionCount, maximumPossibleCount);

  if (safeMinimum > safeMaximum) {
    return [];
  }

  const counts: number[] = [];

  for (let count = safeMinimum; count <= safeMaximum; count++) {
    counts.push(count);
  }

  for (let index = counts.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(random.next() * (index + 1));

    [counts[index], counts[randomIndex]] = [counts[randomIndex], counts[index]];
  }

  return counts;
}

function hasExactAreaCounts(
  areaCounts: AreaCounts,
  targetAreaCounts: AreaCounts,
): boolean {
  const allAreas = new Set([
    ...Object.keys(areaCounts).map(Number),
    ...Object.keys(targetAreaCounts).map(Number),
  ]);

  for (const area of allAreas) {
    if ((areaCounts[area] ?? 0) !== (targetAreaCounts[area] ?? 0)) {
      return false;
    }
  }

  return true;
}

function pickRootPlan(
  plans: PartitionPlan[],
  context: SearchContext,
): PartitionPlan {
  const exactCandidates = plans
    .filter((plan) =>
      hasExactAreaCounts(plan.areaCounts, context.targetAreaCounts),
    )
    .slice(0, 4);

  if (exactCandidates.length > 0) {
    return exactCandidates[
      Math.floor(context.random.next() * exactCandidates.length)
    ];
  }

  const candidates = plans.slice(0, Math.min(10, plans.length));
  const bestPenalty = candidates[0].distributionPenalty;
  const temperature = 0.8;

  const weightedCandidates = candidates.map((plan) => ({
    plan,
    weight: Math.exp(-(plan.distributionPenalty - bestPenalty) / temperature),
  }));

  const totalWeight = weightedCandidates.reduce(
    (sum, item) => sum + item.weight,
    0,
  );

  let cursor = context.random.next() * totalWeight;

  for (const item of weightedCandidates) {
    cursor -= item.weight;

    if (cursor <= 0) {
      return item.plan;
    }
  }

  return candidates[0];
}

function getPriorityAreas(
  distribution: AreaDistributionItem[],
  targetAreaCounts: AreaCounts,
  rootLeafCount: number,
): number[] {
  return distribution
    .filter((item) => {
      const targetCount = targetAreaCounts[item.area] ?? 0;

      return targetCount > 0 && targetCount < Math.max(2, rootLeafCount * 0.15);
    })
    .sort(
      (first, second) =>
        first.weight - second.weight || second.area - first.area,
    )
    .slice(0, MAX_PRIORITY_AREAS)
    .map((item) => item.area);
}

function createSearchContext(
  gridSize: GridSizePreset,
  rows: number,
  cols: number,
  maxRegionArea: number,
  allowSingleCellRegions: boolean,
  rootLeafCount: number,
  random: RandomSource,
): SearchContext | null {
  const minimumRegionArea = getMinimumRegionArea(allowSingleCellRegions);

  const distribution = getActiveAreaDistribution(
    gridSize,
    maxRegionArea,
    allowSingleCellRegions,
  );

  if (distribution.length === 0) {
    return null;
  }

  const rootArea = rows * cols;
  const targetAreaCounts = sampleTargetAreaCounts(
    distribution,
    rootArea,
    rootLeafCount,
    random,
  );

  if (!targetAreaCounts) {
    return null;
  }

  const beamWidth = gridSize <= 10 ? 8 : gridSize <= 15 ? 6 : 4;

  return {
    minimumRegionArea,
    maxRegionArea,
    distribution,
    targetDistribution: createTargetDistribution(
      distribution,
      targetAreaCounts,
    ),
    targetAreaCounts,
    priorityAreas: getPriorityAreas(
      distribution,
      targetAreaCounts,
      rootLeafCount,
    ),
    rootArea,
    rootLeafCount,
    beamWidth,
    maxNodes: Math.max(4_000, rows * cols * 30),
    visitedNodes: 0,
    reachedNodeLimit: false,
    memo: new Map(),
    probabilityCache: new Map(),
    random,
  };
}

export function generatePartitionRegions(
  rows: number,
  cols: number,
  gridSize: GridSizePreset,
  maxRegionArea: number,
  allowSingleCellRegions: boolean,
  random: RandomSource,
  minimumTargetRegionCount: number,
  maximumTargetRegionCount: number,
): RectangleRegion[] | null {
  const minimumRegionArea = getMinimumRegionArea(allowSingleCellRegions);

  if (maxRegionArea < minimumRegionArea) {
    return null;
  }

  const targetRegionCounts = getTargetRegionCounts(
    rows,
    cols,
    maxRegionArea,
    allowSingleCellRegions,
    minimumTargetRegionCount,
    maximumTargetRegionCount,
    random,
  );

  for (const candidateRegionCount of targetRegionCounts) {
    const context = createSearchContext(
      gridSize,
      rows,
      cols,
      maxRegionArea,
      allowSingleCellRegions,
      candidateRegionCount,
      random,
    );

    if (!context) {
      continue;
    }

    const plans = solvePlans(cols, rows, candidateRegionCount, context);

    if (plans.length === 0) {
      continue;
    }

    const selectedPlan = pickRootPlan(plans, context);
    const regions: RectangleRegion[] = [];

    materializeTemplate(selectedPlan.template, 0, 0, regions);

    return normalizeRegionIds(regions);
  }

  return null;
}
