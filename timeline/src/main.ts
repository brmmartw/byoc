import {
    ChartConfig,
    ChartModel,
    CustomChartContext,
    getChartContext,
    ChartToTSEvent,
    ColumnType,
    Query,
} from '@thoughtspot/ts-chart-sdk'; // Review
import Highcharts from 'highcharts';
import timeline from 'highcharts/modules/timeline';
import _ from 'lodash';

// Initialize the timeline module for Highcharts
timeline(Highcharts);

let globalChartReference: Highcharts.Chart;

// Utility function to extract column IDs by key
const getColumnIdListByKey = (
    chartConfig: ChartConfig,
    key: string,
): string[] => {
    const dimension = _.find(chartConfig.dimensions, (dim) => dim.key === key);
    if (dimension) {
        return dimension.columns.map((col) => col.id);
    }
    return [];
};

// Function to process the data model for the timeline chart
const getTimelineDataModel = (chartModel: ChartModel) => {
    const chartConfig = chartModel.config?.chartConfig?.[0] ?? ({} as any);
    const columnsList = chartModel.data?.[0].data.columns;
    const dataValue = chartModel.data?.[0].data.dataValue;

    // Process the data to group by the category field
    const dataMap = _.reduce(
        dataValue,
        (acc: any, dataArr: any) => {
            const point = _.reduce(
                columnsList,
                (acc: any, col: any, idx: number) => {
                    acc[col] = dataArr[idx];
                    return acc;
                },
                {},
            );
            acc.push(point);
            return acc;
        },
        [],
    );

    // Assuming 'category' is the category field and 'datetime' holds the dates
    const groupedData = _.groupBy(dataMap, getColumnIdListByKey(chartConfig, 'category')[0]);

    // Build the series data for the timeline chart
    const seriesData = _.map(groupedData, (events, category) => {
        return _.map(events, event => ({
            x: Date.parse(event[getColumnIdListByKey(chartConfig, 'datetime')[0]]), // Convert datetime to timestamp
            name: category, // Use category as the name
            label: event[getColumnIdListByKey(chartConfig, 'label')[0]] || '', // Event description
        }));
    }).flat();

    return seriesData;
};

// Function to render the timeline chart
const render = (ctx: CustomChartContext) => {
    const chartModel = ctx.getChartModel();

    // Get the processed data model for the timeline chart
    const seriesData = getTimelineDataModel(chartModel);

    globalChartReference = Highcharts.chart('container', {
        chart: {
            type: 'timeline',
        },
               title: {
            text: 'Dynamic Timeline Chart',
        },
        xAxis: {
            type: 'datetime',
            visible: false,
        },
        yAxis: {
            gridLineWidth: 1,
            title: null,
            labels: {
                enabled: false,
            },
        },
        series: [{
            data: seriesData,
        }],
        tooltip: {
            style: {
                width: '300px'
            },
            valueDecimals: 0,
            shared: true
        }
    });
};

// Function to manage the rendering lifecycle
const renderChart = async (ctx: CustomChartContext): Promise<void> => {
    if (globalChartReference) {
        globalChartReference.destroy();
    }
    try {
        ctx.emitEvent(ChartToTSEvent.RenderStart);
        render(ctx);
    } catch (e) {
        ctx.emitEvent(ChartToTSEvent.RenderError, {
            hasError: true,
            error: e,
        });
    } finally {
        ctx.emitEvent(ChartToTSEvent.RenderComplete);
    }
};

// Initialization function for the custom chart
const init = async () => {
    const ctx = await getChartContext({
        renderChart: (context: CustomChartContext) => renderChart(context),
        getDefaultChartConfig: (chartModel: ChartModel): ChartConfig[] => {
            const cols = chartModel.columns;

            // Filter for datetime and category columns
            const datetimeColumns = _.filter(
                cols,
                (col) => col.type === ColumnType.TIMESTAMP, // Assuming 'TIMESTAMP' is the type for datetime
            );

            const categoryColumns = _.filter(
                cols,
                (col) => col.type === ColumnType.ATTRIBUTE, // Assuming 'ATTRIBUTE' is the type for category
            );

            if (datetimeColumns.length === 0 || categoryColumns.length === 0) {
                return [];
            }

            const axisConfig: ChartConfig = {
                key: 'timeline',
                dimensions: [
                    {
                        key: 'datetime',
                        columns: datetimeColumns.slice(0, 1),
                    },
                    {
                        key: 'category',
                        columns: categoryColumns.slice(0, 1),
                    },
                ],
            };
            return [axisConfig];
        },
        getQueriesFromChartConfig: (
            chartConfig: ChartConfig[],
        ): Array<Query> => {
            return chartConfig.map(
                (config: ChartConfig): Query =>
                    _.reduce(
                        config.dimensions,
                        (acc: Query, dimension) => ({
                            queryColumns: [
                                ...acc.queryColumns,
                                ...dimension.columns,
                            ],
                        }),
                        {
                            queryColumns: [],
                        } as Query,
                    ),
            );
        },
        visualPropEditorDefinition: {
            // Define any additional visual properties if needed
        },
        validateConfig: (
            updatedConfig: ChartConfig[],
            _chartModel: ChartModel,
        ) => {
            if (updatedConfig.length === 0) {
                return {
                    isValid: false,
                    error: 'Please select at least one datetime and one category column',
                };
            }
            const datetimeColumns = getColumnIdListByKey(updatedConfig[0], 'datetime');
            const categoryColumns = getColumnIdListByKey(updatedConfig[0], 'category');
            if (datetimeColumns.length === 0 || categoryColumns.length === 0) {
                return
