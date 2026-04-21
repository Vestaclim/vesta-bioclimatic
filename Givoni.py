import numpy as np
import matplotlib as mpl
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.widgets import Slider, TextBox, CheckButtons
from matplotlib.lines import Line2D
from matplotlib.patches import Polygon

# Désactiver la barre d'outils par défaut de Matplotlib
mpl.rcParams['toolbar'] = 'None'

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
    HR = (pv / psat) * 100
    return HR

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
#  PARAMÈTRES INITIAUX & LIMITES
# ─────────────────────────────────────────────

X_MAX = 52
Y_MAX = 35

T_range  = np.linspace(0, X_MAX, 600)
P_init   = 1013.25
Text_init= 25.0
HAext_init = 10.0
Tint_init= 28.0
HAint_init= 12.0

# États de visibilité des zones d'évaluation
check_vis = [False, False, False, False]
fills = {'eff': None, 'fav': None, 'lim': None, 'nul': None}

# ─────────────────────────────────────────────
#  MISE EN PAGE RESPONSIVE
# ─────────────────────────────────────────────

fig = plt.figure(figsize=(16, 9.5), facecolor='#FFFFFF')
fig.suptitle("Diagramme Psychrométrique Bioclimatique (Givoni)", fontsize=18, fontweight='bold', y=0.96)

gs = gridspec.GridSpec(1, 2, width_ratios=[3.5, 1.2],
                       wspace=0.15, left=0.08, right=0.95, top=0.88, bottom=0.42)

ax_graph  = fig.add_subplot(gs[0, 0])
ax_stats  = fig.add_subplot(gs[0, 1])
ax_stats.axis('off')

# ─────────────────────────────────────────────
#  INTERFACE UTILISATEUR (Sliders + TextBoxes)
# ─────────────────────────────────────────────

X_SLIDERS = 0.16
W_SLIDERS = 0.32
W_TEXTBOX = 0.04
X_TEXTBOX = X_SLIDERS + W_SLIDERS + 0.02

# --- BLOC 1 : CONDITIONS EXTÉRIEURES ---
fig.text(0.06, 0.33, "🌐 CONDITIONS EXTÉRIEURES (Zones de confort & Point Bleu)", fontweight='bold', fontsize=11, color='#2C3E50')

ax_sl_P    = fig.add_axes([X_SLIDERS, 0.29, W_SLIDERS, 0.02], facecolor='#EAEDED')
ax_tx_P    = fig.add_axes([X_TEXTBOX, 0.29, W_TEXTBOX, 0.02])
ax_sl_Text = fig.add_axes([X_SLIDERS, 0.25, W_SLIDERS, 0.02], facecolor='#EAEDED')
ax_tx_Text = fig.add_axes([X_TEXTBOX, 0.25, W_TEXTBOX, 0.02])
ax_sl_Hext = fig.add_axes([X_SLIDERS, 0.21, W_SLIDERS, 0.02], facecolor='#EAEDED')
ax_tx_Hext = fig.add_axes([X_TEXTBOX, 0.21, W_TEXTBOX, 0.02])

sl_P    = Slider(ax_sl_P,    'Pression Atm. (hPa)', 600, 1050, valinit=P_init, valstep=1, color='#7F8C8D')
sl_P.valtext.set_visible(False)
tx_P    = TextBox(ax_tx_P, '', initial=str(P_init), textalignment='center')

sl_Text = Slider(ax_sl_Text, 'T° Extérieure (°C)', 0.0, 50.0, valinit=Text_init, valstep=0.5, color='#E67E22')
sl_Text.valtext.set_visible(False)
tx_Text = TextBox(ax_tx_Text, '', initial=str(Text_init), textalignment='center')

sl_Hext = Slider(ax_sl_Hext, 'HA Extérieure (g/kg)', 0.0, 35.0, valinit=HAext_init, valstep=0.1, color='#F39C12')
sl_Hext.valtext.set_visible(False)
tx_Hext = TextBox(ax_tx_Hext, '', initial=str(HAext_init), textalignment='center')

# --- BLOC 2 : CONDITIONS INTÉRIEURES ---
fig.text(0.06, 0.15, "🏠 CONDITIONS INTÉRIEURES (Cible Rouge)", fontweight='bold', fontsize=11, color='#2C3E50')

ax_sl_Tint = fig.add_axes([X_SLIDERS, 0.11, W_SLIDERS, 0.02], facecolor='#F4F6F6')
ax_tx_Tint = fig.add_axes([X_TEXTBOX, 0.11, W_TEXTBOX, 0.02])
ax_sl_Hint = fig.add_axes([X_SLIDERS, 0.07, W_SLIDERS, 0.02], facecolor='#F4F6F6')
ax_tx_Hint = fig.add_axes([X_TEXTBOX, 0.07, W_TEXTBOX, 0.02])

sl_Tint = Slider(ax_sl_Tint, 'T° Instantanée (°C)', 0, 50, valinit=Tint_init, valstep=0.5, color='#C0392B')
sl_Tint.valtext.set_visible(False)
tx_Tint = TextBox(ax_tx_Tint, '', initial=str(Tint_init), textalignment='center')

sl_Hint = Slider(ax_sl_Hint, 'Humidité Abs. (g/kg)', 0, 35, valinit=HAint_init, valstep=0.1, color='#2980B9')
sl_Hint.valtext.set_visible(False)
tx_Hint = TextBox(ax_tx_Hint, '', initial=str(HAint_init), textalignment='center')

# --- BLOC 3 : ÉVALUATION DU POTENTIEL DE RAFRAÎCHISSEMENT NOCTURNE ---
fig.text(0.60, 0.29, "📊 ÉVALUATION DU POTENTIEL DE RAFRAÎCHISSEMENT NOCTURNE", fontweight='bold', fontsize=10, color='#2C3E50')
ax_check = fig.add_axes([0.60, 0.05, 0.35, 0.22], facecolor='#FFFFFF')
ax_check.spines['top'].set_visible(False)
ax_check.spines['right'].set_visible(False)
ax_check.spines['bottom'].set_visible(False)
ax_check.spines['left'].set_visible(False)

checkboxes = CheckButtons(
    ax_check,
    (
        ' 1. Efficace (T° < 20°C, HA < 12 g/kg)',
        ' 2. Favorable (T° < 22°C, HA < 13.5 g/kg)',
        ' 3. Limitée (T° < 24°C, HA < 15.0 g/kg)',
        ' 4. Nulle (T° > 24°C ou HA > 15.0 g/kg)'
    ),
    (False, False, False, False)
)

# Stylisation des labels des checkboxes
colors = ['#27AE60', '#2ECC71', '#F39C12', '#E74C3C']
for label, color in zip(checkboxes.labels, colors):
    label.set_color(color)
    label.set_fontweight('bold')
    label.set_fontsize(10)

# ─────────────────────────────────────────────
#  ÉLÉMENTS GRAPHIQUES & ZONES DE GIVONI
# ─────────────────────────────────────────────

courbes_hr  = {}
line_sat,   = ax_graph.plot([], [], color='black', lw=1.5, zorder=5)

point_inst, = ax_graph.plot([], [], marker='+', color='red', ms=12, mew=1.5, zorder=10)
point_ext,  = ax_graph.plot([], [], marker='o', color='#3498DB', ms=8, mew=1, zorder=9, alpha=0.9)

# ── Zones existantes ──
patch_vent_noct = Polygon([[0,0]], closed=True, facecolor='#EBF5FB', edgecolor='black', lw=1.2, alpha=0.6, zorder=3)
patch_confort   = Polygon([[0,0]], closed=True, facecolor='#27AE60', edgecolor='black', lw=1.5, alpha=0.45, zorder=4)

# ── Trois nouvelles zones (même style transparent que vent. nocturne) ──
patch_vent_nat  = Polygon([[0,0]], closed=True, facecolor='#AED6F1', edgecolor='#2471A3', lw=1.2, alpha=0.50, zorder=3)
patch_masse     = Polygon([[0,0]], closed=True, facecolor='#FAD7A0', edgecolor='#D35400', lw=1.2, alpha=0.50, zorder=3)
patch_evap      = Polygon([[0,0]], closed=True, facecolor='#D2B4DE', edgecolor='#7D3C98', lw=1.2, alpha=0.50, zorder=3)

ax_graph.add_patch(patch_vent_noct)
ax_graph.add_patch(patch_vent_nat)
ax_graph.add_patch(patch_masse)
ax_graph.add_patch(patch_evap)
ax_graph.add_patch(patch_confort)   # confort au-dessus des autres zones

# Légende compacte en haut à gauche (2 colonnes × 4 lignes)
legend_elements = [
    Polygon([[0,0]], facecolor='#27AE60',  edgecolor='black', lw=1.5, alpha=0.45, label='Confort (Givoni)'),
    Polygon([[0,0]], facecolor='#EBF5FB',  edgecolor='black', lw=1.2, alpha=0.6,  label='Vent. Nocturne'),
    Polygon([[0,0]], facecolor='#AED6F1',  edgecolor='#2471A3', lw=1.2, alpha=0.5, label='Vent. Naturelle'),
    Polygon([[0,0]], facecolor='#FAD7A0',  edgecolor='#D35400', lw=1.2, alpha=0.5, label='Refr. de Masse'),
    Polygon([[0,0]], facecolor='#D2B4DE',  edgecolor='#7D3C98', lw=1.2, alpha=0.5, label='Refr. Évaporatif'),
    Line2D([0], [0], color='red', marker='+', lw=0, ms=10, mew=1.5, label='Intérieur (Cible)'),
    Line2D([0], [0], color='#3498DB', marker='o', lw=0, ms=8, mew=1, label='Extérieur (Bilan)')
]
ax_graph.legend(handles=legend_elements, loc='upper left', framealpha=0.95,
                edgecolor='#BDC3C7', fontsize=8.5, ncol=2)

ax_graph.set_xlabel("Température au bulbe sec (°C)", fontsize=12)
ax_graph.set_ylabel("Humidité Absolue (g/kg d'air sec)", fontsize=12)
ax_graph.set_xlim(0, X_MAX)
ax_graph.set_ylim(0, Y_MAX)
ax_graph.grid(True, linestyle=':', color='#BDC3C7', alpha=0.8)

etiquettes_hr = {}


# ─────────────────────────────────────────────
#  CALCUL DES ZONES DE GIVONI (base + extensions)
# ─────────────────────────────────────────────

def calculer_zones_givoni(Tpma, P):
    """Retourne les polygones confort + ventilation nocturne (zones existantes)."""
    Tc = 0.31 * Tpma + 17.8
    Tmin, Tmax = Tc - 3.5, Tc + 3.5
    points_resolution = 50

    def F(T, HR): return min(rapport_melange(T, HR, P), 16.0)

    # 1. ZONE DE CONFORT
    T_C_haut = np.linspace(Tmin, Tmax - 2, points_resolution)
    Y_C_haut = np.minimum(rapport_melange(T_C_haut, 80, P), 16.0)
    Y_chanfrein = min(rapport_melange(Tmax, 50, P), 16.0)
    T_C_bas = np.linspace(Tmax, Tmin, points_resolution)
    Y_C_bas = np.minimum(rapport_melange(T_C_bas, 20, P), 16.0)

    poly_C = list(zip(T_C_haut, Y_C_haut))
    poly_C.append((Tmax, Y_chanfrein))
    poly_C.extend(list(zip(T_C_bas, Y_C_bas)))

    # 2. ZONE VENTILATION NOCTURNE
    poly_V = []
    y_bottom = F(Tmin, 20)
    poly_V.append((Tmin, y_bottom))
    poly_V.append((Tmin + 24, y_bottom))
    poly_V.append((Tmin + 24, F(Tmin + 24, 20)))
    y_top = F(Tmax - 2, 80)
    poly_V.append((Tmax + 13, y_top))
    poly_V.append((Tmax - 2, y_top))
    T_V_haut = np.linspace(Tmax - 2, Tmin, points_resolution)
    Y_V_haut = np.minimum(rapport_melange(T_V_haut, 80, P), 16.0)
    poly_V.extend(list(zip(T_V_haut, Y_V_haut)))

    return np.array(poly_C), np.array(poly_V)


def calculer_zones_extensions(Tpma, P):
    """
    Calcule les 3 nouvelles zones en s'assurant qu'elles suivent
    parfaitement les courbes psychrométriques et le palier de confort.
    """
    Tc   = 0.31 * Tpma + 17.8
    Tmin = Tc - 3.5
    Tmax = Tc + 3.5
    pts  = 60

    # Fonction f : Humidité absolue réelle (non plafonnée)
    def f_arr(T_arr, HR):
        return rapport_melange(T_arr, HR, P)
        
    def f_s(T, HR):
        return float(rapport_melange(np.atleast_1d(float(T)), HR, P)[0])

    # Fonction F : Humidité absolue plafonnée à 16 g/kg
    def F_arr(T_arr, HR):
        return np.minimum(rapport_melange(T_arr, HR, P), 16.0)

    def F_s(T, HR):
        return float(np.minimum(rapport_melange(np.atleast_1d(float(T)), HR, P), 16.0)[0])

    # Calcul de Ttransition (intersection courbe 80% et palier 16 g/kg)
    pv_16 = (16.0 * P) / (621.98 + 16.0)
    psat_80 = pv_16 / 0.80
    Y_val = np.log(psat_80 / 6.112)
    Ttransition = (243.5 * Y_val) / (17.67 - Y_val)

    # ──────────────────────────────────────────
    # CRÉATION DE LA BORDURE SUPÉRIEURE COMMUNE (de droite à gauche)
    # Suit le palier à 16 g/kg puis la courbe des 80%
    # ──────────────────────────────────────────
    T_shared = np.linspace(Tmax - 2, Tmin, pts)
    # On force l'insertion du point de transition pour un angle parfait
    if Tmin < Ttransition < (Tmax - 2):
        T_shared = np.append(T_shared, Ttransition)
        T_shared = np.sort(T_shared)[::-1] # Tri décroissant (de Tmax-2 vers Tmin)
    
    Y_shared = F_arr(T_shared, 80)
    bordure_superieure = list(zip(T_shared, Y_shared))

    # ──────────────────────────────────────────
    # 1. VENTILATION NATURELLE
    # ──────────────────────────────────────────
    poly_VN = []
    poly_VN.append((Tmin, F_s(Tmin, 20)))
    poly_VN.append((Tmin, f_s(Tmin, 100)))
    
    T_top_vn = np.linspace(Tmin, Tmax, pts)
    poly_VN.extend(zip(T_top_vn, f_arr(T_top_vn, 100)))
    
    poly_VN.append((Tmax + 5, f_s(Tmax + 5, 50)))
    poly_VN.append((Tmax + 5, F_s(Tmax + 5, 20)))
    
    T_bot_vn = np.linspace(Tmax + 5, Tmin, pts)
    poly_VN.extend(zip(T_bot_vn, F_arr(T_bot_vn, 20)))

    # ──────────────────────────────────────────
    # 2. REFROIDISSEMENT DE LA MASSE THERMIQUE
    # ──────────────────────────────────────────
    poly_M = []
    base_y = F_s(Tmin, 20)
    poly_M.append((Tmin, base_y))
    poly_M.append((Tmin + 17, base_y))
    poly_M.append((Tmin + 17, F_s(Tmin + 17, 30)))
    
    poly_M.append((Tmax + 8, F_s(Tmax - 2, 80)))
    
    # 👉 On utilise la bordure partagée pour revenir à Tmin
    poly_M.extend(bordure_superieure)

    # ──────────────────────────────────────────
    # 3. REFROIDISSEMENT ÉVAPORATIF
    # ──────────────────────────────────────────
    def g_adiabat(T, W):
        return T + (2.5 * W)

    poly_EC = []
    w1 = F_s(Tmin, 20)
    poly_EC.append((Tmin, w1))
    poly_EC.append((g_adiabat(Tmin, w1), 0.0))
    poly_EC.append((Tmin + 21, 0.0))
    poly_EC.append((Tmin + 21, F_s(Tmin + 21, 10)))
    poly_EC.append((Tmin + 19, F_s(Tmin + 19, 20)))
    poly_EC.append((Tmin + 16, F_s(Tmin + 16, 30)))
    
    # 👉 On utilise la bordure partagée pour revenir à Tmin
    poly_EC.extend(bordure_superieure)

    return np.array(poly_VN), np.array(poly_M), np.array(poly_EC)

# ─────────────────────────────────────────────
#  TRACÉ DES COURBES HR
# ─────────────────────────────────────────────

def tracer_courbes(P):
    pas = 10
    for _, line in courbes_hr.items(): line.remove()
    courbes_hr.clear()
    for lbl in etiquettes_hr.values(): lbl.remove()
    etiquettes_hr.clear()

    valeurs = list(range(pas, 100, pas))
    for hr in valeurs:
        r = rapport_melange(T_range, hr, P)
        mask = r <= Y_MAX
        if not np.any(mask): continue

        T_valid = T_range[mask]
        r_valid = r[mask]
        line, = ax_graph.plot(T_valid, r_valid, color='gray', lw=0.8, linestyle='-', alpha=0.4, zorder=1)
        courbes_hr[hr] = line

        if len(T_valid) == len(T_range):
            x_pos, y_pos, ha, va, dx, dy = X_MAX, r_valid[-1], 'left', 'center', 0.5, 0
        else:
            x_pos, y_pos, ha, va, dx, dy = T_valid[-1], Y_MAX, 'center', 'bottom', 0, 0.5

        etiquettes_hr[hr] = ax_graph.text(x_pos + dx, y_pos + dy, f'{hr}%', fontsize=9,
                                          va=va, ha=ha, color='gray', clip_on=False)

    r_sat = rapport_melange(T_range, 100, P)
    mask_sat = r_sat <= Y_MAX
    if np.any(mask_sat):
        T_valid_sat = T_range[mask_sat]
        r_valid_sat = r_sat[mask_sat]
        line_sat.set_data(T_valid_sat, r_valid_sat)

        if len(T_valid_sat) == len(T_range):
            x_pos, y_pos, ha, va, dx, dy = X_MAX, r_valid_sat[-1], 'left', 'center', 0.5, 0
        else:
            x_pos, y_pos, ha, va, dx, dy = T_valid_sat[-1], Y_MAX, 'center', 'bottom', 0, 0.5

        etiquettes_hr[100] = ax_graph.text(x_pos + dx, y_pos + dy, '100%', fontsize=10,
                                           va=va, ha=ha, fontweight='bold', clip_on=False)


# ─────────────────────────────────────────────
#  STATISTIQUES
# ─────────────────────────────────────────────

def mettre_a_jour_stats(Tint, HAint, Text, HAext, P):
    ax_stats.clear()
    ax_stats.axis('off')

    HRint  = ha_vers_hr(HAint, Tint, P)
    h_int  = enthalpie(Tint, HAint)
    Tw_int = bulbe_humide(Tint, HRint, P)
    Td_int = point_rosee(Tint, HRint)
    HRext  = ha_vers_hr(HAext, Text, P)
    Tc     = 0.31 * Text + 17.6

    donnees = [
        ("DONNÉES INTÉRIEURES", "", ""),
        ("T° Bulbe sec",         f"{Tint:.2f}",   "°C"),
        ("Humidité Absolue",     f"{HAint:.3f}",  "g/kg"),
        ("Humidité Relative",    f"{HRint:.2f}",  "%"),
        ("Enthalpie",            f"{h_int:.2f}",   "kJ/kg"),
        ("Point de rosée",       f"{Td_int:.2f}",  "°C"),
        ("T° Bulbe humide",      f"{Tw_int:.2f}",  "°C"),
        ("────────────────", "", ""),
        ("DONNÉES EXTÉRIEURES", "", ""),
        ("T° Bulbe sec (Ext)",   f"{Text:.1f}", "°C"),
        ("Humidité Absolue",     f"{HAext:.3f}", "g/kg"),
        ("Humidité Relative",    f"{HRext:.1f}", "%"),
        ("Pression Atm.",        f"{P:.1f}",   "hPa"),
        ("T° Confort cible (Tc)",f"{Tc:.1f}",  "°C"),
    ]

    ax_stats.set_ylim(0, len(donnees))
    for i, (nom, val, unite) in enumerate(reversed(donnees)):
        y = i + 0.5
        if nom in ["DONNÉES INTÉRIEURES", "DONNÉES EXTÉRIEURES"]:
            ax_stats.text(0.5, y, nom, fontsize=11, fontweight='bold', ha='center', color='#2980B9')
            continue
        if nom.startswith('─'):
            ax_stats.axhline(y, color='gray', lw=0.5)
            continue
        ax_stats.text(0.0, y, nom, fontsize=10, va='center')
        couleur_val = 'red' if "Relative" in nom and float(val) > 100 else 'black'
        ax_stats.text(1.0, y, f"{val} {unite}", fontsize=10, va='center', ha='right',
                      fontweight='bold', color=couleur_val)


# ─────────────────────────────────────────────
#  MOTEURS D'ÉVÈNEMENTS
# ─────────────────────────────────────────────

is_updating = False

def update(val=None):
    global is_updating
    if is_updating: return
    is_updating = True

    P     = sl_P.val
    Text  = sl_Text.val
    HAext = sl_Hext.val
    Tint  = sl_Tint.val
    HAint = sl_Hint.val

    # Synchronisation des TextBox
    if tx_P.text    != f"{P:.1f}":    tx_P.set_val(f"{P:.1f}")
    if tx_Text.text != f"{Text:.1f}": tx_Text.set_val(f"{Text:.1f}")
    if tx_Hext.text != f"{HAext:.1f}": tx_Hext.set_val(f"{HAext:.1f}")
    if tx_Tint.text != f"{Tint:.1f}": tx_Tint.set_val(f"{Tint:.1f}")
    if tx_Hint.text != f"{HAint:.1f}": tx_Hint.set_val(f"{HAint:.1f}")

    # ── Zones existantes ──
    poly_C, poly_V = calculer_zones_givoni(Text, P)
    patch_confort.set_xy(poly_C)
    patch_vent_noct.set_xy(poly_V)

    # ── Trois nouvelles zones ──
    poly_VN, poly_M, poly_EC = calculer_zones_extensions(Text, P)
    patch_vent_nat.set_xy(poly_VN)
    patch_masse.set_xy(poly_M)
    patch_evap.set_xy(poly_EC)

    # ── Zones d'évaluation du rafraîchissement nocturne ──
    global check_vis
    if fills['eff']: fills['eff'].remove()
    if fills['fav']: fills['fav'].remove()
    if fills['lim']: fills['lim'].remove()
    if fills['nul']: fills['nul'].remove()

    T_fill = np.linspace(0, X_MAX, 500)
    HA_sat = rapport_melange(T_fill, 100, P)

    y2_eff = np.where(T_fill <= 20, np.minimum(12.0, HA_sat), 0)
    y2_fav = np.where(T_fill <= 22, np.minimum(13.5, HA_sat), 0)
    y2_lim = np.where(T_fill <= 24, np.minimum(15.0, HA_sat), 0)

    fills['eff'] = ax_graph.fill_between(T_fill, 0, y2_eff, where=(y2_eff > 0),   color='#27AE60', alpha=0.35, zorder=1, visible=check_vis[0])
    fills['fav'] = ax_graph.fill_between(T_fill, y2_eff, y2_fav, where=(y2_fav > y2_eff), color='#2ECC71', alpha=0.35, zorder=1, visible=check_vis[1])
    fills['lim'] = ax_graph.fill_between(T_fill, y2_fav, y2_lim, where=(y2_lim > y2_fav), color='#F39C12', alpha=0.35, zorder=1, visible=check_vis[2])
    fills['nul'] = ax_graph.fill_between(T_fill, y2_lim, HA_sat, where=(HA_sat > y2_lim), color='#E74C3C', alpha=0.35, zorder=1, visible=check_vis[3])

    tracer_courbes(P)

    point_inst.set_data([Tint], [HAint])
    point_ext.set_data([Text], [HAext])

    mettre_a_jour_stats(Tint, HAint, Text, HAext, P)
    fig.canvas.draw_idle()

    is_updating = False


# Callbacks Checkboxes
def toggle_zones(label):
    global check_vis
    check_vis = checkboxes.get_status()
    if fills['eff']: fills['eff'].set_visible(check_vis[0])
    if fills['fav']: fills['fav'].set_visible(check_vis[1])
    if fills['lim']: fills['lim'].set_visible(check_vis[2])
    if fills['nul']: fills['nul'].set_visible(check_vis[3])
    fig.canvas.draw_idle()

checkboxes.on_clicked(toggle_zones)

def submit_val(text, slider):
    try: slider.set_val(float(text.replace(',', '.')))
    except ValueError: pass

tx_P.on_submit(lambda t: submit_val(t, sl_P))
tx_Text.on_submit(lambda t: submit_val(t, sl_Text))
tx_Hext.on_submit(lambda t: submit_val(t, sl_Hext))
tx_Tint.on_submit(lambda t: submit_val(t, sl_Tint))
tx_Hint.on_submit(lambda t: submit_val(t, sl_Hint))

sl_P.on_changed(update)
sl_Text.on_changed(update)
sl_Hext.on_changed(update)
sl_Tint.on_changed(update)
sl_Hint.on_changed(update)


def on_scroll(event):
    if event.inaxes != ax_graph: return
    base_scale = 1.15
    scale_factor = 1 / base_scale if event.button == 'up' else base_scale

    cur_xlim, cur_ylim = ax_graph.get_xlim(), ax_graph.get_ylim()
    xdata, ydata = event.xdata, event.ydata

    new_width  = (cur_xlim[1] - cur_xlim[0]) * scale_factor
    new_height = (cur_ylim[1] - cur_ylim[0]) * scale_factor
    relx = (cur_xlim[1] - xdata) / (cur_xlim[1] - cur_xlim[0])
    rely = (cur_ylim[1] - ydata) / (cur_ylim[1] - cur_ylim[0])

    new_xmin = xdata - new_width * (1 - relx)
    new_xmax = xdata + new_width * relx
    new_ymin = ydata - new_height * (1 - rely)
    new_ymax = ydata + new_height * rely

    new_xmin, new_xmax = max(0, new_xmin), min(X_MAX, new_xmax)
    new_ymin, new_ymax = max(0, new_ymin), min(Y_MAX, new_ymax)

    if new_xmax - new_xmin >= X_MAX: new_xmin, new_xmax = 0, X_MAX
    if new_ymax - new_ymin >= Y_MAX: new_ymin, new_ymax = 0, Y_MAX

    ax_graph.set_xlim(new_xmin, new_xmax)
    ax_graph.set_ylim(new_ymin, new_ymax)
    fig.canvas.draw_idle()

fig.canvas.mpl_connect('scroll_event', on_scroll)

update()
plt.show()