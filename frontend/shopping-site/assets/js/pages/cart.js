/*
  pages/cart.js
  - 购物车列表（localStorage）
  - 数量修改、删除、清空
  - 会员礼券叠加说明（生日券、满减券、品牌券、积分抵扣）
*/

import { productById } from "../product-data.js";
import { calcCartTotals, clearCart, removeFromCart, updateCartQty } from "../cart-store.js";
import { syncBadges, toast } from "../app.js";
import { productImageUrl } from "../ui-products.js";
import {
  getCoupons,
  getPoints,
  calcBestCombination,
  calcSelectedDiscount,
  COUPON_TYPE_LABELS,
  canStackWith,
  getStackConflictReason,
} from "../coupon-store.js";

let selectedCouponIds = [];

function money(n) {
  const v = Number(n) || 0;
  return `¥${v.toFixed(0)}`;
}

function renderCart() {
  const table = document.querySelector("[data-role='cart-table']");
  const totals = document.querySelector("[data-role='cart-totals']");
  const empty = document.querySelector("[data-role='cart-empty']");
  const couponArea = document.querySelector("[data-role='coupon-area']");

  const res = calcCartTotals((id) => productById(id));
  const hasItems = res.lines.some((x) => x.product);

  if (!table || !totals || !empty || !couponArea) return;

  empty.style.display = hasItems ? "none" : "";
  table.style.display = hasItems ? "" : "none";
  totals.style.display = hasItems ? "" : "none";
  couponArea.style.display = hasItems ? "" : "none";

  if (!hasItems) return;

  const rows = res.lines
    .map((l) => {
      const p = l.product;
      if (!p) return "";
      return `
        <tr data-id="${p.id}">
          <td>
            <a class="cart-item" href="./product.html?id=${encodeURIComponent(p.id)}">
              <div class="cart-thumb"><img src="${productImageUrl(p, { w: 120, h: 120 })}" alt="${escapeHTML(p.name)}" loading="lazy" /></div>
              <div>
                <div class="cart-name">${escapeHTML(p.name)}</div>
                <div class="cart-meta">${escapeHTML(p.category)} · 编号 ${p.id}</div>
              </div>
            </a>
          </td>
          <td class="price">${money(l.price)}</td>
          <td>
            <input class="input" data-role="qty" type="number" min="1" max="99" value="${l.qty}" style="width:88px;" />
          </td>
          <td class="price">${money(l.total)}</td>
          <td>
            <button class="btn danger" type="button" data-action="remove">删除</button>
          </td>
        </tr>
      `;
    })
    .join("");

  table.querySelector("tbody").innerHTML = rows;

  const couponResult = calcSelectedDiscount(selectedCouponIds, res.lines, res.subtotal);
  const best = calcBestCombination(res.lines, res.subtotal);
  const points = getPoints();
  const coupons = getCoupons();

  const totalDiscount = res.discount + couponResult.totalDiscount;
  const payable = Math.max(0, res.subtotal + res.shipping - totalDiscount);

  const appliedIds = couponResult.applied.map((c) => c.id);

  totals.innerHTML = `
    <div class="card pad">
      <div class="panel-title">费用明细</div>
      <div class="list">
        <div class="item"><div>商品小计</div><div class="tag"><span class="chip">${money(res.subtotal)}</span></div></div>
        <div class="item"><div>运费（满199免运）</div><div class="tag"><span class="chip">${money(res.shipping)}</span></div></div>
        <div class="item">
          <div>
            <div>系统满减（满299减40）</div>
            ${couponResult.details.length > 0 ? `
              <div class="desc">礼券优惠（${couponResult.details.length} 张已应用）</div>
              ${couponResult.details.map(d => `<div class="desc desc--indented">· ${d.coupon.name}：-${money(d.discount)}</div>`).join("")}
            ` : ""}
            ${couponResult.unapplied.length > 0 ? `
              <div class="desc desc--warn">${couponResult.unapplied.length} 张未应用（有冲突）</div>
            ` : ""}
          </div>
          <div class="tag"><span class="chip">-${money(totalDiscount)}</span></div>
        </div>
        <div class="item"><div style="font-weight:900;">应付</div><div class="tag"><span class="price-chip">${money(payable)}</span></div></div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
        <a class="btn primary" href="./checkout.html">去结算</a>
        <button class="btn" type="button" data-action="clear">清空购物车</button>
      </div>
      <div class="notice" style="margin-top:12px;">
        <strong>提示：</strong>购物车保存在 localStorage，刷新/关闭浏览器后仍保留（演示）。
      </div>
    </div>
  `;

  couponArea.innerHTML = `
    <div class="card pad coupon-section">
      <div class="coupon-section__head">
        <div class="panel-title" style="margin:0;">会员礼券</div>
        <div class="coupon-section__points">可用积分：<strong>${points}</strong></div>
      </div>

      <div class="coupon-tabs">
        <button class="coupon-tab active" data-coupon-tab="all">全部</button>
        <button class="coupon-tab" data-coupon-tab="birthday">生日券</button>
        <button class="coupon-tab" data-coupon-tab="threshold">满减券</button>
        <button class="coupon-tab" data-coupon-tab="brand">品牌券</button>
        <button class="coupon-tab" data-coupon-tab="points">积分抵扣</button>
      </div>

      <div class="coupon-list" data-role="coupon-list">
        ${renderCouponList("all", coupons, points, res, appliedIds)}
      </div>

      ${couponResult.conflicts.length > 0 ? `
        <div class="coupon-conflicts">
          <div class="coupon-conflicts__title">
            <span class="icon-warn">⚠</span> 不可叠加提示
          </div>
          ${couponResult.conflicts.map((cf) => `
            <div class="coupon-conflict-item">
              <span class="coupon-conflict__badge">${COUPON_TYPE_LABELS[cf.a.type]}</span>
              <span class="coupon-conflict__vs">×</span>
              <span class="coupon-conflict__badge">${COUPON_TYPE_LABELS[cf.b.type]}</span>
              <div class="coupon-conflict__reason">${cf.reason}</div>
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${best.bestCombo.length > 0 ? `
        <div class="coupon-best">
          <div class="coupon-best__title">
            <span class="icon-best">★</span> 最优叠加方案
          </div>
          <div class="coupon-best__combo">
            ${best.bestCombo.map((c) => `<span class="coupon-best__tag">${c.name}</span>`).join(" + ")}
          </div>
          <div class="coupon-best__save">
            礼券共省 <strong>${money(best.bestDiscount)}</strong>
          </div>
          <button class="btn primary btn-sm" type="button" data-action="apply-best">一键使用最优方案</button>
        </div>
      ` : ""}
    </div>

    <div class="card pad coupon-rules">
      <div class="panel-title">叠加规则说明</div>
      <ul class="coupon-rules__list">
        <li><strong>可叠加：</strong>生日券 + 品牌券 + 积分抵扣</li>
        <li><strong>可叠加：</strong>满减券 + 积分抵扣</li>
        <li><strong>不可叠加：</strong>生日券与满减券（均为全场优惠）</li>
        <li><strong>不可叠加：</strong>满减券与品牌券（均为订单级优惠）</li>
        <li><strong>积分抵扣：</strong>100积分抵1元，最多抵订单金额的 20%</li>
      </ul>
    </div>
  `;

  bindCartEvents();
  bindCouponEvents(res);
}

function renderCouponList(tab, coupons, points, cartResult, appliedIds = []) {
  const pointsCoupon = {
    id: "c_points_use",
    type: "points",
    name: "积分抵扣",
    desc: `可用 ${points} 积分，100积分抵1元，最多抵订单金额20%`,
    points: points,
  };

  let list = [...coupons];
  if (tab === "all") {
    list = [...coupons, pointsCoupon];
  } else if (tab === "points") {
    list = [pointsCoupon];
  } else {
    list = coupons.filter((c) => c.type === tab);
  }

  if (list.length === 0) {
    return `<div class="coupon-empty">暂无此类礼券</div>`;
  }

  return list
    .map((c) => {
      const isSelected = selectedCouponIds.includes(c.id);
      const isApplied = appliedIds.includes(c.id);
      const canUse = checkCouponUsable(c, cartResult);
      const stackInfo = getStackHint(c, selectedCouponIds);

      let discountDisplay = "";
      if (c.type === "points") {
        discountDisplay = `${Math.floor(points / 100)}元`;
      } else if (c.discountType === "rate") {
        discountDisplay = `${(c.discount * 10).toFixed(1)}折`;
      } else {
        discountDisplay = `¥${c.discount}`;
        if (c.highDiscount) {
          discountDisplay = `¥${c.discount}~¥${c.highDiscount}`;
        }
      }

      return `
        <label class="coupon-card ${isSelected ? "is-selected" : ""} ${isApplied ? "is-applied" : ""} ${!canUse ? "is-disabled" : ""} coupon-type--${c.type}">
          <input type="checkbox" data-coupon-id="${c.id}" ${isSelected ? "checked" : ""} ${!canUse ? "disabled" : ""} />
          <div class="coupon-card__left">
            <div class="coupon-card__amount">${discountDisplay}</div>
            <div class="coupon-card__cond">
              ${c.minAmount > 0 ? `满 ¥${c.minAmount} 可用` : "无门槛"}
              ${c.category ? ` · ${c.category}` : ""}
            </div>
          </div>
          <div class="coupon-card__right">
            <div class="coupon-card__name">${c.name}</div>
            <div class="coupon-card__desc">${c.desc}</div>
            <div class="coupon-card__type">${COUPON_TYPE_LABELS[c.type]}</div>
          </div>
          ${!canUse ? `<div class="coupon-card__mask">条件未满足</div>` : ""}
          ${isApplied ? `<div class="coupon-card__badge coupon-card__badge--applied">已应用</div>` : ""}
          ${isSelected && !isApplied && stackInfo ? `<div class="coupon-card__stack-hint">${stackInfo}</div>` : ""}
        </label>
      `;
    })
    .join("");
}

function checkCouponUsable(coupon, cartResult) {
  if (coupon.type === "points") {
    return cartResult.subtotal > 0 && coupon.points >= 100;
  }
  if (coupon.category) {
    const catTotal = cartResult.lines
      .filter((l) => l.product && l.product.category === coupon.category)
      .reduce((s, l) => s + l.total, 0);
    return catTotal >= coupon.minAmount;
  }
  return cartResult.subtotal >= coupon.minAmount;
}

function getStackHint(coupon, selectedIds) {
  const otherSelected = selectedIds.filter((id) => id !== coupon.id);
  if (otherSelected.length === 0) return null;

  const allCoupons = getCoupons();
  const points = getPoints();
  const pointsCoupon = {
    id: "c_points_use",
    type: "points",
    name: "积分抵扣",
    points: points,
  };
  const all = [...allCoupons, pointsCoupon];

  const conflicts = [];
  for (const id of otherSelected) {
    const other = all.find((x) => x.id === id);
    if (other && !canStackWith(coupon.type, other.type)) {
      conflicts.push(COUPON_TYPE_LABELS[other.type]);
    }
  }

  if (conflicts.length > 0) {
    return `与 ${conflicts.join("、")} 不可叠加`;
  }
  return null;
}

function bindCartEvents() {
  const table = document.querySelector("[data-role='cart-table']");
  const totals = document.querySelector("[data-role='cart-totals']");
  if (!table || !totals) return;

  table.addEventListener("change", (e) => {
    const qty = e.target.closest("[data-role='qty']");
    if (!qty) return;
    const tr = qty.closest("tr");
    const id = tr?.getAttribute("data-id");
    if (!id) return;
    updateCartQty(id, qty.value);
    syncBadges();
    renderCart();
  });

  table.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='remove']");
    if (!btn) return;
    const tr = btn.closest("tr");
    const id = tr?.getAttribute("data-id");
    if (!id) return;
    removeFromCart(id);
    syncBadges();
    toast("已删除商品", `商品 ${id}`);
    renderCart();
  });

  totals.addEventListener("click", (e) => {
    const clearBtn = e.target.closest("[data-action='clear']");
    if (clearBtn) {
      clearCart();
      syncBadges();
      toast("购物车已清空", "可以继续挑选商品");
      renderCart();
    }
  });
}

function bindCouponEvents(cartResult) {
  const couponArea = document.querySelector("[data-role='coupon-area']");
  if (!couponArea) return;

  couponArea.addEventListener("click", (e) => {
    const applyBestBtn = e.target.closest("[data-action='apply-best']");
    if (applyBestBtn) {
      const res = calcCartTotals((id) => productById(id));
      const best = calcBestCombination(res.lines, res.subtotal);
      selectedCouponIds = best.bestCombo.map((c) => c.id);
      toast("已应用最优方案", `共省 ¥${best.bestDiscount}`);
      renderCart();
    }
  });

  const couponList = document.querySelector("[data-role='coupon-list']");
  if (!couponList) return;

  couponList.addEventListener("change", (e) => {
    const checkbox = e.target.closest('input[type="checkbox"][data-coupon-id]');
    if (!checkbox) return;
    const id = checkbox.getAttribute("data-coupon-id");
    if (!id) return;

    if (checkbox.checked) {
      if (!selectedCouponIds.includes(id)) {
        selectedCouponIds.push(id);
      }
    } else {
      selectedCouponIds = selectedCouponIds.filter((x) => x !== id);
    }
    renderCart();
  });

  const tabs = document.querySelectorAll(".coupon-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.getAttribute("data-coupon-tab");
      document.querySelectorAll(".coupon-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      const list = document.querySelector("[data-role='coupon-list']");
      if (list) {
        const coupons = getCoupons();
        const points = getPoints();
        const couponResult = calcSelectedDiscount(selectedCouponIds, cartResult.lines, cartResult.subtotal);
        const appliedIds = couponResult.applied.map((c) => c.id);
        list.innerHTML = renderCouponList(tabName, coupons, points, cartResult, appliedIds);
      }
    });
  });
}

function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

renderCart();
