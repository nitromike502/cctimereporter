<template>
  <div class="token-chart-container">
    <Line ref="chartRef" :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup>
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
} from 'chart.js'
import { Line } from 'vue-chartjs'
import { ref } from 'vue'

// Register chart.js modules at module level — idempotent, safe to call multiple times.
ChartJS.register(Title, Tooltip, Legend, LineElement, CategoryScale, LinearScale, PointElement)

const props = defineProps({
  chartData: {
    type: Object,
    required: true,
  },
  chartOptions: {
    type: Object,
    required: true,
  },
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
