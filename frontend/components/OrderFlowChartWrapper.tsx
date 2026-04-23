"use client";

import dynamic from "next/dynamic";
import { DayFlow } from "@/lib/api";

const OrderFlowChart = dynamic(() => import("@/components/OrderFlowChart"), { ssr: false });

export default function OrderFlowChartWrapper({ data }: { data: DayFlow[] }) {
  return <OrderFlowChart data={data} />;
}
