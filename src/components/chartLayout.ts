/*
 * Horizontal layout shared by the balance chart and the ready-year bars.
 * Both charts must use these, or the same year stops lining up between them,
 * and the bars' shading and hover highlight (which work out a year's width
 * from them) come out the wrong width.
 */

/** Width of each chart's container, as a share of the card. */
export const CHART_CONTAINER_WIDTH = '95%';

/** Space left and right of the plot, outside the y-axis. */
export const CHART_SIDE_MARGINS = { left: 20, right: 30 };

/** Width of the y-axis labels. */
export const CHART_Y_AXIS_WIDTH = 70;

/** Width of the plot area itself, given a chart's full width. */
export const plotWidth = (chartWidth: number) =>
  chartWidth - CHART_SIDE_MARGINS.left - CHART_SIDE_MARGINS.right - CHART_Y_AXIS_WIDTH;
