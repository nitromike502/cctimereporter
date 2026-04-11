<template>
  <div class="token-chart-container">
    <Bar v-if="chartType === 'bar'" ref="chartRef" :data="chartData" :options="chartOptions" />
    <Line v-else ref="chartRef" :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup>
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
} from 'chart.js'
import { Line, Bar } from 'vue-chartjs'
import { ref } from 'vue'

ChartJS.register(Title, Tooltip, Legend, LineElement, BarElement, CategoryScale, LinearScale, PointElement)

defineProps({
  chartData: { type: Object, required: true },
  chartOptions: { type: Object, required: true },
  chartType: { type: String, default: 'bar' },
})

const chartRef = ref(null)
defineExpose({ chartRef })
</script>

<style scoped>
.token-chart-container {
  position: relative;
  height: 400px;
  width: 100%;
}
</style>
