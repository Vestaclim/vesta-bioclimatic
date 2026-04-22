import streamlit as st
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Polygon

# ─────────────────────────────────────────────
#  CONFIGURATION DE LA PAGE WEB STREAMLIT
# ─────────────────────────────────────────────
st.set_page_config(page_title="Diagramme Givoni", layout="wide", initial_sidebar_state="expanded")

# ─────────────────────────────────────────────
#  FONCTIONS PSYCHROMÉTRIQUES
# ─────────────────────────────────────────────

def p_sat(T):
    return 6.112 * np.exp((17.67 * T) / (T + 243.5))

def rapport_melange(T, HR, P):
    pv = p_sat(T) * (HR / 100)
    return 621.98 * (pv / np.maximum(P - pv, 0.01))

def ha_vers_hr(HA, T, P):
    pv = (HA * P) / (621.98 + HA)
    psat = p_sat(T)
    return (pv / psat) * 100

def point_rosee(T, HR):
    a, b = 17.67, 243.5
    ln_rh = np.log(np.maximum(HR / 100, 0.001))
    alpha = (a * T) / (b + T)
    return (b * (alpha + ln_rh)) / (a - alpha - ln_rh)

def bulbe_humide(T, HR, P):
    Td = point_rosee(T, HR)
    return T - (0.00066 * P / 10) * (T - Td) * (1 + 0.00115 * Td)

def enthalpie(T, HA):
    w = HA / 1000
    return 1.006 * T + w * (2501 + 1.86 * T)

# ─────────────────────────────────────────────
#  CALCUL DES ZONES DE GIVONI
# ─────────────────────────────────────────────

def calculer_zones_givoni(Tpma, P):
    Tc = 0.31 * Tpma + 17.8
    Tmin, Tmax = Tc - 3.5, Tc + 3.5
    pts = 50

    def F(T, HR): return min(rapport_melange(T, HR, P), 16.0)

    # ZONE DE CONFORT
    T_C_haut = np.linspace(Tmin, Tmax - 2, pts)
    Y_C_haut = np.minimum(rapport_melange(T_C_haut, 80, P), 16.0)
    Y_chanfrein = min(rapport_melange(Tmax, 50, P), 16.0)
    T_C_bas = np.linspace(Tmax, Tmin, pts)
    Y_C_bas = np.minimum(rapport_melange(T_C_bas, 20, P), 16.0)

    poly_C = list(zip(T_C_haut, Y_C_haut))
    poly_C.append((Tmax, Y_chanfrein))
    poly_C.extend(list(zip(T_C_bas, Y_C_bas)))

    # ZONE VENTILATION NOCTURNE
    poly_V = []
    y_bottom = F(Tmin, 20)
    poly_V.extend([(Tmin, y_bottom), (Tmin + 24, y_bottom), (Tmin + 24, F(Tmin + 24, 20))])
    y_top = F(Tmax - 2, 80)
    poly_V.extend([(Tmax + 13, y_top), (Tmax - 2, y_top)])
    T_V_haut = np.linspace(Tmax - 2, Tmin, pts)
    poly_V.extend(list(zip(T_V_haut, np.minimum(rapport_melange(T_V_haut, 80, P), 16.0))))

    return np.array(poly_C), np.array(poly_V)

def calculer_zones_extensions(Tpma, P):
    Tc = 0.31 * Tpma + 17.8
    Tmin, Tmax = Tc - 3.5, Tc + 3.5
    pts = 60

    def f_arr(T_arr, HR): return rapport_melange(T_arr, HR, P)
    def f_s(T, HR): return float(rapport_melange(np.atleast_1d(float(T)), HR, P)[0])
    def F_arr(T_arr, HR): return np.minimum(rapport_melange(T_arr, HR, P), 16.0)
    def F_s(T, HR): return float(np.minimum(rapport_melange(np.atleast_1d(float(T)), HR, P), 16.0)[0])

    pv_16 = (16.0 * P) / (621.98 + 16.0)
    psat_80 = pv_16 / 0.80
    Y_val = np.log(psat_80 / 6.112)
    Ttransition = (243.5 * Y_val) / (17.67 - Y_val)

    T_shared = np.linspace(Tmax - 2, Tmin, pts)
    if Tmin < Ttransition < (Tmax - 2):
        T_shared = np.append(T_shared, Ttransition)
        T_shared = np.sort(T_shared)[::-1]
    
    bordure_superieure = list(zip(T_shared, F_arr(T_shared, 80)))

    # 1. VENTILATION NATURELLE
    poly_VN = [(Tmin, F_s(Tmin, 20)), (Tmin, f_s(Tmin, 100))]
    T_top_vn = np.linspace(Tmin, Tmax, pts)
    poly_VN.extend(zip(T_top_vn, f_arr(T_top_vn, 100)))
    poly_VN.extend([(Tmax + 5, f_s(Tmax + 5, 50)), (Tmax + 5, F_s(Tmax + 5, 20))])
    T_bot_vn = np.linspace(Tmax + 5, Tmin, pts)
    poly_VN.extend(zip(T_bot_vn, F_arr(T_bot_vn, 20)))

    # 2. MASSE THERMIQUE
    base_y = F_s(Tmin, 20)
    poly_M = [(Tmin, base_y), (Tmin + 17, base_y), (Tmin + 17, F_s(Tmin + 17, 30)), (Tmax + 8, F_s(Tmax - 2, 80))]
    poly_M.extend(bordure_superieure)

    # 3. ÉVAPORATIF
    poly_EC = [(Tmin, base_y), (Tmin + 2.5 * base_y, 0.0), (Tmin + 21, 0.0), 
               (Tmin + 21, F_s(Tmin + 21, 10)), (Tmin + 19, F_s(Tmin + 19, 20)), (Tmin + 16, F_s(Tmin + 16, 30))]
    poly_EC.extend(bordure_superieure)

    return np.array(poly_VN), np.array(poly_M), np.array(poly_EC)

# ─────────────────────────────────────────────
#  INTERFACE UTILISATEUR (SIDEBAR)
# ─────────────────────────────────────────────

st.sidebar.title("Paramètres")

st.sidebar.markdown("### 🌐 CONDITIONS EXTÉRIEURES")
P = st.sidebar.slider("Pression Atm. (hPa)", 600.0, 1050.0, 1013.25, step=1.0)
Text = st.sidebar.slider("T° Extérieure (°C)", 0.0, 50.0, 25.0, step=0.5)
HAext = st.sidebar.slider("HA Extérieure (g/kg)", 0.0, 35.0, 10.0, step=0.1)

st.sidebar.markdown("### 🏠 CONDITIONS INTÉRIEURES")
Tint = st.sidebar.slider("T° Instantanée (°C)", 0.0, 50.0, 28.0, step=0.5)
HAint = st.sidebar.slider("Humidité Abs. (g/kg)", 0.0, 35.0, 12.0, step=0.1)

st.sidebar.markdown("### 📊 ÉVALUATION NOCTURNE")
chk_eff = st.sidebar.checkbox("1. Efficace (T° < 20°C, HA < 12 g/kg)", value=False)
chk_fav = st.sidebar.checkbox("2. Favorable (T° < 22°C, HA < 13.5 g/kg)", value=False)
chk_lim = st.sidebar.checkbox("3. Limitée (T° < 24°C, HA < 15.0 g/kg)", value=False)
chk_nul = st.sidebar.checkbox("4. Nulle (T° > 24°C ou HA > 15.0 g/kg)", value=False)

# ─────────────────────────────────────────────
#  CALCULS DES STATISTIQUES
# ─────────────────────────────────────────────

HRint = ha_vers_hr(HAint, Tint, P)
h_int = enthalpie(Tint, HAint)
Tw_int = bulbe_humide(Tint, HRint, P)
Td_int = point_rosee(Tint, HRint)

HRext = ha_vers_hr(HAext, Text, P)
Tc = 0.31 * Text + 17.6

# ─────────────────────────────────────────────
#  AFFICHAGE PRINCIPAL (GRAPHIQUE + DONNÉES)
# ─────────────────────────────────────────────

st.title("Diagramme Psychrométrique Bioclimatique (Givoni)")

col_graph, col_stats = st.columns([3, 1])

with col_graph:
    X_MAX, Y_MAX = 52, 35
    T_range = np.linspace(0, X_MAX, 600)

    fig, ax = plt.subplots(figsize=(10, 7), facecolor='#FFFFFF')
    
    # 1. Dessin des zones Givoni
    poly_C, poly_V = calculer_zones_givoni(Text, P)
    poly_VN, poly_M, poly_EC = calculer_zones_extensions(Text, P)

    ax.add_patch(Polygon(poly_V, closed=True, facecolor='#EBF5FB', edgecolor='black', lw=1.2, alpha=0.6, zorder=3))
    ax.add_patch(Polygon(poly_VN, closed=True, facecolor='#AED6F1', edgecolor='#2471A3', lw=1.2, alpha=0.5, zorder=3))
    ax.add_patch(Polygon(poly_M, closed=True, facecolor='#FAD7A0', edgecolor='#D35400', lw=1.2, alpha=0.5, zorder=3))
    ax.add_patch(Polygon(poly_EC, closed=True, facecolor='#D2B4DE', edgecolor='#7D3C98', lw=1.2, alpha=0.5, zorder=3))
    ax.add_patch(Polygon(poly_C, closed=True, facecolor='#27AE60', edgecolor='black', lw=1.5, alpha=0.45, zorder=4))

    # 2. Dessin des évaluations nocturnes (Couches de couleurs)
    T_fill = np.linspace(0, X_MAX, 500)
    HA_sat = rapport_melange(T_fill, 100, P)
    y2_eff = np.where(T_fill <= 20, np.minimum(12.0, HA_sat), 0)
    y2_fav = np.where(T_fill <= 22, np.minimum(13.5, HA_sat), 0)
    y2_lim = np.where(T_fill <= 24, np.minimum(15.0, HA_sat), 0)

    if chk_eff: ax.fill_between(T_fill, 0, y2_eff, where=(y2_eff > 0), color='#27AE60', alpha=0.35, zorder=1)
    if chk_fav: ax.fill_between(T_fill, y2_eff, y2_fav, where=(y2_fav > y2_eff), color='#2ECC71', alpha=0.35, zorder=1)
    if chk_lim: ax.fill_between(T_fill, y2_fav, y2_lim, where=(y2_lim > y2_fav), color='#F39C12', alpha=0.35, zorder=1)
    if chk_nul: ax.fill_between(T_fill, y2_lim, HA_sat, where=(HA_sat > y2_lim), color='#E74C3C', alpha=0.35, zorder=1)

    # 3. Tracé des courbes d'humidité relative (HR)
    for hr in range(10, 110, 10):
        r = rapport_melange(T_range, hr, P)
        mask = r <= Y_MAX
        if np.any(mask):
            T_valid, r_valid = T_range[mask], r[mask]
            
            # Courbe de saturation plus épaisse et noire
            if hr == 100:
                ax.plot(T_valid, r_valid, color='black', lw=1.5, zorder=5)
                texte_args = {'fontweight': 'bold', 'color': 'black', 'fontsize': 10}
            else:
                ax.plot(T_valid, r_valid, color='gray', lw=0.8, linestyle='-', alpha=0.4, zorder=1)
                texte_args = {'color': 'gray', 'fontsize': 9}

            # Placement des étiquettes à la fin des courbes
            if len(T_valid) == len(T_range):
                x_pos, y_pos, ha, va, dx, dy = X_MAX, r_valid[-1], 'left', 'center', 0.5, 0
            else:
                x_pos, y_pos, ha, va, dx, dy = T_valid[-1], Y_MAX, 'center', 'bottom', 0, 0.5
            ax.text(x_pos + dx, y_pos + dy, f'{hr}%', va=va, ha=ha, clip_on=False, **texte_args)

    # 4. Placement des points Intérieur et Extérieur
    ax.plot([Text], [HAext], marker='o', color='#3498DB', ms=8, mew=1, zorder=9, alpha=0.9)
    ax.plot([Tint], [HAint], marker='+', color='red', ms=12, mew=1.5, zorder=10)

    # 5. Esthétique & Légende
    legend_elements = [
        Polygon([[0,0]], facecolor='#27AE60', edgecolor='black', lw=1.5, alpha=0.45, label='Confort (Givoni)'),
        Polygon([[0,0]], facecolor='#EBF5FB', edgecolor='black', lw=1.2, alpha=0.6,  label='Vent. Nocturne'),
        Polygon([[0,0]], facecolor='#AED6F1', edgecolor='#2471A3', lw=1.2, alpha=0.5, label='Vent. Naturelle'),
        Polygon([[0,0]], facecolor='#FAD7A0', edgecolor='#D35400', lw=1.2, alpha=0.5, label='Refr. de Masse'),
        Polygon([[0,0]], facecolor='#D2B4DE', edgecolor='#7D3C98', lw=1.2, alpha=0.5, label='Refr. Évaporatif'),
        Line2D([0], [0], color='red', marker='+', lw=0, ms=10, mew=1.5, label='Intérieur (Cible)'),
        Line2D([0], [0], color='#3498DB', marker='o', lw=0, ms=8, mew=1, label='Extérieur (Bilan)')
    ]
    ax.legend(handles=legend_elements, loc='upper left', framealpha=0.95, edgecolor='#BDC3C7', fontsize=8.5, ncol=2)
    ax.set_xlabel("Température au bulbe sec (°C)", fontsize=12)
    ax.set_ylabel("Humidité Absolue (g/kg d'air sec)", fontsize=12)
    ax.set_xlim(0, X_MAX)
    ax.set_ylim(0, Y_MAX)
    ax.grid(True, linestyle=':', color='#BDC3C7', alpha=0.8)

    st.pyplot(fig)

with col_stats:
    st.markdown("### 🏠 Données Intérieures")
    st.markdown(f"**T° Bulbe sec :** {Tint:.2f} °C")
    st.markdown(f"**Humidité Absolue :** {HAint:.3f} g/kg")
    
    hr_color = "red" if HRint > 100 else "normal"
    st.markdown(f"**Humidité Relative :** :{hr_color}[{HRint:.2f} %]")
    
    st.markdown(f"**Enthalpie :** {h_int:.2f} kJ/kg")
    st.markdown(f"**Point de rosée :** {Td_int:.2f} °C")
    st.markdown(f"**T° Bulbe humide :** {Tw_int:.2f} °C")
    
    st.markdown("---")
    
    st.markdown("### 🌐 Données Extérieures")
    st.markdown(f"**T° Bulbe sec (Ext) :** {Text:.1f} °C")
    st.markdown(f"**Humidité Absolue :** {HAext:.3f} g/kg")
    st.markdown(f"**Humidité Relative :** {HRext:.1f} %")
    st.markdown(f"**Pression Atm. :** {P:.1f} hPa")
    st.markdown(f"**T° Confort cible (Tc) :** {Tc:.1f} °C")