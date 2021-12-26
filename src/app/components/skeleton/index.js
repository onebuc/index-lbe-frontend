import React from "react";
import styles from "./styles.module.css";

export function Skeleton({ type }) {
  return (
    <span
      className={[
        styles.skeleton,
        styles[`skeleton--${type || "default"}`]
      ].join(" ")}
    ></span>
  );
}
