import {
  LineChart,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
} from "recharts";
import { MonteCarloResult } from "../calculators/MonteCarloSimulation";
import { useMemo } from "react";
import { dollarFormatter } from "./MonteCarloForm";

type Percentiles = {
  max: number,
  p90: number,
  p80: number,
  p70: number,
  p60: number,
  median: number,
  p40: number,
  p30: number,
  p20: number,
  p10: number,
  min: number,
};

type PercentilesChartData = Percentiles & { year: number };

type TooltipData = Record<string, Percentiles>;

const CustomTooltip = (props: { label?: string, tooltipData: TooltipData }) => {
  const { tooltipData, label } = props;

  const tooltipYearData = label ? tooltipData[label] : null;
  if (!tooltipYearData) return null;

  return (
    <div className="bg-light">
      <p><strong>Year: {label}</strong></p>
      <p>Max: {dollarFormatter(tooltipYearData.max)}</p>
      <p>90% Percentile: {dollarFormatter(tooltipYearData.p90)}</p>
      <p>80% Percentile: {dollarFormatter(tooltipYearData.p80)}</p>
      <p>70% Percentile: {dollarFormatter(tooltipYearData.p70)}</p>
      <p>60% Percentile: {dollarFormatter(tooltipYearData.p60)}</p>
      <p>Median: {dollarFormatter(tooltipYearData.median)}</p>
      <p>40% Percentile: {dollarFormatter(tooltipYearData.p40)}</p>
      <p>30% Percentile: {dollarFormatter(tooltipYearData.p30)}</p>
      <p>20% Percentile: {dollarFormatter(tooltipYearData.p20)}</p>
      <p>10% Percentile: {dollarFormatter(tooltipYearData.p10)}</p>
      <p>Min: {dollarFormatter(tooltipYearData.min)}</p>
    </div>
  );
};

const MonteCarloGraph = (props: { results: MonteCarloResult[], inflationAdjusted: boolean, onlyShowPercentiles: boolean }) => {
  const { results, inflationAdjusted, onlyShowPercentiles } = props;

  const chartData = useMemo(() => {
    let data: Array<Record<string, number>> = [];
    const dataKey = inflationAdjusted ? 'inflationAdjustedBalance' : 'balance';
    results.forEach((result, index) => {
      result.forEach((yearBalance) => {
        const existingEntry = data.find((entry) => entry.year === yearBalance.year);
        if (existingEntry) {
          existingEntry[`series${index + 1}`] = yearBalance[dataKey];
        } else {
          data.push({
            year: yearBalance.year,
            [`series${index + 1}`]: yearBalance[dataKey],
          });
        }
      });
    });

    if (onlyShowPercentiles) {
      data = data.map((entry) => {
        const { year, ...yearSeries } = entry;

        const newEntry = {
          year: entry.year,
        } as PercentilesChartData;

        const yearBalances = Object.values(yearSeries).sort((a, b) => a - b);
        if (yearBalances.length > 0) {
          newEntry.max = yearBalances[yearBalances.length - 1];
          newEntry.p90 = yearBalances[Math.floor(yearBalances.length * .9)];
          newEntry.p80 = yearBalances[Math.floor(yearBalances.length * .8)];
          newEntry.p70 = yearBalances[Math.floor(yearBalances.length * .7)];
          newEntry.p60 = yearBalances[Math.floor(yearBalances.length * .6)];
          newEntry.median = yearBalances[Math.floor(yearBalances.length * .5)];
          newEntry.p40 = yearBalances[Math.floor(yearBalances.length * .4)];
          newEntry.p30 = yearBalances[Math.floor(yearBalances.length * .3)];
          newEntry.p20 = yearBalances[Math.floor(yearBalances.length * .2)];
          newEntry.p10 = yearBalances[Math.floor(yearBalances.length * .1)];
          newEntry.min = yearBalances[0];
        }

        return newEntry;
      }) as PercentilesChartData[]
    }

    return data;
  }, [results, inflationAdjusted, onlyShowPercentiles]);

  const tooltipData = useMemo(() => {
    return chartData.reduce((data, { year, ...yearSeries }) => {
      if (onlyShowPercentiles) {
        data[year] = yearSeries as PercentilesChartData;
      } else {
        const yearBalances = Object.values(yearSeries).sort((a, b) => a - b);

        if (yearBalances.length === 0) return data;

        data[year] = {
          max: yearBalances[yearBalances.length - 1],
          p90: yearBalances[Math.floor(yearBalances.length * .9)],
          p80: yearBalances[Math.floor(yearBalances.length * .8)],
          p70: yearBalances[Math.floor(yearBalances.length * .7)],
          p60: yearBalances[Math.floor(yearBalances.length * .6)],
          median: yearBalances[Math.floor(yearBalances.length * .5)],
          p40: yearBalances[Math.floor(yearBalances.length * .4)],
          p30: yearBalances[Math.floor(yearBalances.length * .3)],
          p20: yearBalances[Math.floor(yearBalances.length * .2)],
          p10: yearBalances[Math.floor(yearBalances.length * .1)],
          min: yearBalances[0],
        };
      }
      return data;
    }, {} as Record<string, Percentiles>)
  }, [chartData, onlyShowPercentiles]);

  const { year: _, ...yearsSeries } = chartData.length > 0 ? chartData[0] : { year: null };

  const tooltip = useMemo(() => <CustomTooltip tooltipData={tooltipData} />, [tooltipData])

  const allYValues = useMemo(() => results.flatMap((result) => result.map((yearBalance) => yearBalance[inflationAdjusted ? 'inflationAdjustedBalance' : 'balance'])), [results, inflationAdjusted])
  const [customYTicks, customDomain] = useNiceRechartsTicks(
    allYValues,
    5,
    {
      requiredPaddingRate: 0,
      allowableTickIntervalsPerOrderOfMagnitude: [1, 2, 2.5, 3, 4, 5, 6, 7, 8, 9],
    }
  );

  return (
    <ResponsiveContainer width="95%" height={550} debounce={100}>
      <LineChart
        key={`${inflationAdjusted ? 'inflationAdjusted' : 'notInflationAdjusted'}${results.length > 0 ? results[0].at(-1)?.balance : null}`}
        data={chartData}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="year" />
        <YAxis
          ticks={customYTicks} domain={customDomain}
          tickFormatter={dollarFormatter}
          width={140}
          allowDataOverflow={true}
        />
        <Tooltip content={tooltip} />
        {Object.entries(yearsSeries).map(([key, _], index) => (
          <Line
            type="monotone"
            dataKey={key}
            stroke={generateContrastingHexCode()}
            key={index}
            isAnimationActive={false}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

const roundDownToNearest = (num: number, interval: number) => Math.floor(num / interval) * interval;

type Domain = [number, number] | undefined;
type Ticks = number[] | undefined;

const useNiceRechartsTicks = (
  values: number[],
  numTicks: number,
  {
    requiredPaddingRate = 0.1,
    allowableTickIntervalsPerOrderOfMagnitude = [1, 2.5, 5],
    requireWholeNumberTicks = true,
  } = {},
): [Ticks, Domain] => {
  numTicks = Math.max(2, numTicks);

  const [ticks, domain] = useMemo(() => {
    let minValue = getMin(values);
    if (isNaN(minValue)) minValue = 0;
    let maxValue = getMax(values);
    if (isNaN(maxValue)) maxValue = 1000;

    const rawStepSize = Math.max(1, (maxValue - minValue) / (numTicks - 1));

    const rawOrderOfMagnitude = 10 ** Math.floor(Math.log10(rawStepSize));

    for (
      let orderOfMagnitude = rawOrderOfMagnitude;
      orderOfMagnitude <= rawOrderOfMagnitude * 10000;
      orderOfMagnitude *= 10
    ) {
      for (const interval of allowableTickIntervalsPerOrderOfMagnitude) {
        const stepSize = interval * orderOfMagnitude;

        if (requireWholeNumberTicks && stepSize % 1 !== 0) continue;

        const range = stepSize * (numTicks - 1);
        const requiredPadding = requiredPaddingRate * range;

        let minTick = roundDownToNearest(minValue - requiredPadding, stepSize);
        if (minValue >= 0 && minTick < 0) minTick = 0;

        const maxTick = minTick + range;

        if (maxTick >= maxValue + requiredPadding) {
          const ticks = Array.from({ length: numTicks }, (_, i) => minTick + stepSize * i);
          const domain = [ticks[0], ticks[ticks.length - 1]] as Domain;

          return [ticks, domain];
        }
      }
    }

    return [undefined, undefined];
  }, [values, numTicks, requiredPaddingRate, allowableTickIntervalsPerOrderOfMagnitude, requireWholeNumberTicks])

  return [ticks, domain];
};

const generateContrastingHexCode = () => {
  let maxCompositeValue = 500;
  let rgb = [1,1,1];

  do {
    rgb = rgb.map(() => Math.floor(Math.random() * 256))
  } while (rgb.reduce((acc, val) => acc + val, 0) > maxCompositeValue);

  return '#' + rgb.map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

const getMax = (arr: number[]) => {
  // Apparently Math.max hits a call stack size exceeded error when the array gets too big
  let len = arr.length;
  let max = -Infinity;

  while (len--) {
      max = arr[len] > max ? arr[len] : max;
  }
  return max;
}

const getMin = (arr: number[]) => {
  // Apparently Math.min hits a call stack size exceeded error when the array gets too big
  let len = arr.length;
  let min = Infinity;

  while (len--) {
      min = arr[len] < min ? arr[len] : min;
  }
  return min;
}

export default MonteCarloGraph;