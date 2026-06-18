/*
  coupon-store.js
  说明：会员礼券模型层，包含券数据、叠加规则与计算。
  - 券类型：生日券、满减券、品牌券、积分抵扣
  - 叠加规则由 canStackWith 定义
*/

import { readJSON, writeJSON } from "./store.js";

const COUPON_KEY = "aurora_coupon_v1";
const POINTS_KEY = "aurora_points_v1";

export const COUPON_TYPES = {
  BIRTHDAY: "birthday",
  THRESHOLD: "threshold",
  BRAND: "brand",
  POINTS: "points",
};

export const COUPON_TYPE_LABELS = {
  birthday: "生日券",
  threshold: "满减券",
  brand: "品牌券",
  points: "积分抵扣",
};

const DEFAULT_COUPONS = [
  {
    id: "c_birth_001",
    type: "birthday",
    name: "生日专属礼券",
    desc: "生日当月全场无门槛 8.5 折",
    discount: 0.85,
    discountType: "rate",
    minAmount: 0,
    category: null,
  },
  {
    id: "c_thres_001",
    type: "threshold",
    name: "全场满减券",
    desc: "满 299 减 40，满 599 减 100",
    discount: 40,
    discountType: "fixed",
    minAmount: 299,
    highDiscount: 100,
    highMinAmount: 599,
    category: null,
  },
  {
    id: "c_brand_001",
    type: "brand",
    name: "美妆品牌券",
    desc: "美妆品类满 200 减 30",
    discount: 30,
    discountType: "fixed",
    minAmount: 200,
    category: "美妆",
  },
  {
    id: "c_brand_002",
    type: "brand",
    name: "数码品牌券",
    desc: "数码品类满 300 减 50",
    discount: 50,
    discountType: "fixed",
    minAmount: 300,
    category: "数码",
  },
];

const DEFAULT_POINTS = 2000;

function normalizeCoupons(coupons) {
  if (!Array.isArray(coupons) || coupons.length === 0) return [...DEFAULT_COUPONS];
  return coupons.filter((c) => c && c.id && c.type);
}

export function getCoupons() {
  const stored = readJSON(COUPON_KEY, null);
  if (stored) return normalizeCoupons(stored);
  const defaults = [...DEFAULT_COUPONS];
  writeJSON(COUPON_KEY, defaults);
  return defaults;
}

export function getPoints() {
  const p = readJSON(POINTS_KEY, null);
  if (p === null || p === undefined) {
    writeJSON(POINTS_KEY, DEFAULT_POINTS);
    return DEFAULT_POINTS;
  }
  return Math.max(0, Number(p) || 0);
}

export function setPoints(points) {
  writeJSON(POINTS_KEY, Math.max(0, Number(points) || 0));
}

export function getCouponById(id) {
  return getCoupons().find((c) => c.id === id) || null;
}

export function getCouponsByType(type) {
  return getCoupons().filter((c) => c.type === type);
}

const STACK_RULES = {
  birthday: ["points", "brand"],
  threshold: ["points"],
  brand: ["birthday", "points"],
  points: ["birthday", "threshold", "brand"],
};

export function canStackWith(couponTypeA, couponTypeB) {
  if (couponTypeA === couponTypeB) return false;
  const allowed = STACK_RULES[couponTypeA] || [];
  return allowed.includes(couponTypeB);
}

export function getStackConflictReason(couponTypeA, couponTypeB) {
  if (couponTypeA === couponTypeB) {
    return `同类型券（${COUPON_TYPE_LABELS[couponTypeA]}）不可叠加使用`;
  }
  const rules = {
    "birthday-threshold": "生日券与满减券均为全场优惠，不可叠加，请选择更划算的一张",
    "threshold-birthday": "满减券与生日券均为全场优惠，不可叠加，请选择更划算的一张",
    "threshold-brand": "满减券与品牌券均为订单级优惠，不可叠加，请选择更划算的一张",
    "brand-threshold": "品牌券与满减券均为订单级优惠，不可叠加，请选择更划算的一张",
  };
  const key = `${couponTypeA}-${couponTypeB}`;
  return rules[key] || "该组合暂不支持叠加使用";
}

export function calcCouponDiscount(coupon, cartLines, subtotal) {
  if (!coupon) return 0;
  const amount = Number(subtotal) || 0;

  if (coupon.type === "points") {
    const maxDeductible = Math.floor(amount * 0.2);
    const pointsValue = Math.floor(coupon.points / 100);
    return Math.min(pointsValue, maxDeductible);
  }

  if (coupon.category) {
    const categoryTotal = cartLines
      .filter((l) => l.product && l.product.category === coupon.category)
      .reduce((s, l) => s + l.total, 0);
    if (categoryTotal < coupon.minAmount) return 0;
  } else {
    if (amount < coupon.minAmount) return 0;
  }

  if (coupon.discountType === "rate") {
    const base = coupon.category
      ? cartLines
          .filter((l) => l.product && l.product.category === coupon.category)
          .reduce((s, l) => s + l.total, 0)
      : amount;
    return Math.floor(base * (1 - coupon.discount));
  }

  if (coupon.discountType === "fixed") {
    if (coupon.highMinAmount && amount >= coupon.highMinAmount) {
      return coupon.highDiscount;
    }
    return coupon.discount;
  }

  return 0;
}

function calcComboDiscount(combo, cartLines, subtotal) {
  const sorted = [...combo].sort((a, b) => {
    const order = { birthday: 0, threshold: 1, brand: 2, points: 3 };
    return (order[a.type] || 99) - (order[b.type] || 99);
  });

  let runningTotal = Number(subtotal) || 0;
  let totalDiscount = 0;
  const details = [];

  for (const c of sorted) {
    const d = calcCouponDiscount(c, cartLines, runningTotal);
    details.push({ coupon: c, discount: d, applied: true });
    totalDiscount += d;
    runningTotal -= d;
  }

  return {
    combo: sorted,
    totalDiscount,
    details,
  };
}

export function calcBestCombination(cartLines, subtotal) {
  const coupons = getCoupons();
  const points = getPoints();
  const pointsCoupon = {
    id: "c_points_use",
    type: "points",
    name: "积分抵扣",
    desc: `可用 ${points} 积分，100 积分抵 1 元，最多抵订单金额 20%`,
    points: points,
  };

  const allCoupons = [...coupons, pointsCoupon];
  const combos = [[]];

  for (const c of allCoupons) {
    const currentLen = combos.length;
    for (let i = 0; i < currentLen; i++) {
      const combo = combos[i];
      const canAdd = combo.every((existing) => canStackWith(existing.type, c.type));
      if (canAdd) {
        combos.push([...combo, c]);
      }
    }
  }

  let bestCombo = [];
  let bestDiscount = 0;
  let bestDetails = [];

  for (const combo of combos) {
    const result = calcComboDiscount(combo, cartLines, subtotal);
    if (result.totalDiscount > bestDiscount) {
      bestDiscount = result.totalDiscount;
      bestCombo = result.combo;
      bestDetails = result.details;
    }
  }

  return {
    bestCombo,
    bestDiscount,
    bestDetails,
    allCoupons,
    pointsCoupon,
  };
}

export function calcSelectedDiscount(selectedIds, cartLines, subtotal) {
  const all = [...getCoupons()];
  const points = getPoints();
  const pointsCoupon = {
    id: "c_points_use",
    type: "points",
    name: "积分抵扣",
    desc: `可用 ${points} 积分，100 积分抵 1 元，最多抵订单金额 20%`,
    points: points,
  };
  all.push(pointsCoupon);

  const selected = [];
  for (const id of selectedIds) {
    const c = all.find((x) => x.id === id);
    if (c) selected.push(c);
  }

  const conflicts = [];
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      if (!canStackWith(selected[i].type, selected[j].type)) {
        conflicts.push({
          a: selected[i],
          b: selected[j],
          reason: getStackConflictReason(selected[i].type, selected[j].type),
        });
      }
    }
  }

  const combos = [[]];
  for (const c of selected) {
    const currentLen = combos.length;
    for (let i = 0; i < currentLen; i++) {
      const combo = combos[i];
      const canAdd = combo.every((existing) => canStackWith(existing.type, c.type));
      if (canAdd) {
        combos.push([...combo, c]);
      }
    }
  }

  let bestCombo = [];
  let bestDiscount = 0;
  let bestDetails = [];

  for (const combo of combos) {
    const result = calcComboDiscount(combo, cartLines, subtotal);
    if (result.totalDiscount > bestDiscount) {
      bestDiscount = result.totalDiscount;
      bestCombo = result.combo;
      bestDetails = result.details;
    }
  }

  const appliedIds = bestCombo.map((c) => c.id);
  const unapplied = selected.filter((c) => !appliedIds.includes(c.id));

  return {
    selected,
    applied: bestCombo,
    unapplied: unapplied,
    details: bestDetails,
    totalDiscount: bestDiscount,
    conflicts,
    points,
  };
}
