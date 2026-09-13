"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import styles from "./demo.module.css";

export type DemoTrendPoint = { label: string; emissions: number };
export type DemoModePoint = { label: string; emissions: number; color: string };

const tooltipStyle = { background: "#fffdf7", border: "1px solid #d4d7cb", borderRadius: 4, fontSize: 12, color: "#17251c" };

export default function DemoCharts({ trend, byMode }: { trend: DemoTrendPoint[]; byMode: DemoModePoint[] }) {
  return <div className={styles.charts}>
    <section className={styles.chartPanel} aria-labelledby="trend-heading">
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>EMISSIONS OVER TIME</span><h3 id="trend-heading">A clearer view of every month.</h3></div><span className={styles.unit}>tCO₂e</span></div>
      <div className={styles.chartCanvas} role="img" aria-label="Monthly emissions area chart. Exact values are available in the accessible data table below.">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 14, right: 10, bottom: 0, left: -22 }} accessibilityLayer>
            <defs><linearGradient id="demo-emissions-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a1b777" stopOpacity={0.36}/><stop offset="100%" stopColor="#a1b777" stopOpacity={0.02}/></linearGradient></defs>
            <CartesianGrid stroke="#e5e6dc" vertical={false}/><XAxis dataKey="label" tick={{ fontSize: 10, fill: "#777f70" }} tickLine={false} axisLine={false} minTickGap={18}/><YAxis tick={{ fontSize: 10, fill: "#777f70" }} tickLine={false} axisLine={false}/>
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${Number(value).toFixed(2)} tCO₂e`, "Emissions"]}/><Area type="monotone" dataKey="emissions" stroke="#58763f" fill="url(#demo-emissions-area)" strokeWidth={2.2} isAnimationActive={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <table className={styles.srOnly}><caption>Monthly emissions, tonnes of CO₂ equivalent</caption><thead><tr><th>Month</th><th>tCO₂e</th></tr></thead><tbody>{trend.map(row => <tr key={row.label}><th>{row.label}</th><td>{row.emissions.toFixed(4)}</td></tr>)}</tbody></table>
    </section>
    <section className={styles.chartPanel} aria-labelledby="mix-heading">
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>MODE BREAKDOWN</span><h3 id="mix-heading">Find the carbon hotspots.</h3></div><span className={styles.unit}>tCO₂e</span></div>
      <div className={styles.chartCanvas} role="img" aria-label="Emissions by transport mode. Exact values are available in the accessible data table below.">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={byMode} layout="vertical" margin={{ top: 8, right: 14, bottom: 0, left: -14 }} barSize={19} accessibilityLayer><CartesianGrid stroke="#e5e6dc" horizontal={false}/><XAxis type="number" tick={{ fontSize: 10, fill: "#777f70" }} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="label" width={65} tick={{ fontSize: 11, fill: "#53614f" }} tickLine={false} axisLine={false}/><Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#eeefe5" }} formatter={(value) => [`${Number(value).toFixed(2)} tCO₂e`, "Emissions"]}/><Bar dataKey="emissions" radius={[0, 2, 2, 0]} isAnimationActive={false}>{byMode.map(row => <Cell key={row.label} fill={row.color}/>)}</Bar></BarChart></ResponsiveContainer>
      </div>
      <table className={styles.srOnly}><caption>Emissions by transport mode, tonnes of CO₂ equivalent</caption><thead><tr><th>Mode</th><th>tCO₂e</th></tr></thead><tbody>{byMode.map(row => <tr key={row.label}><th>{row.label}</th><td>{row.emissions.toFixed(4)}</td></tr>)}</tbody></table>
    </section>
  </div>;
}
