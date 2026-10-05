"""Soundtrack for the brag video: one piece in D major / B minor, 120 BPM, bars start at t=3.0.
Music and sound effects share the key, the reverb and the bus, so the effects sit inside the track."""
import sys, wave
import numpy as np

SR = 48000
DUR = 20.0
N = int(SR * DUR)
HL_ROWS = int(sys.argv[1]) if len(sys.argv) > 1 else 4
rng = np.random.default_rng(7)

def hz(midi): return 440.0 * 2 ** ((midi - 69) / 12)
def tt(d): return np.arange(int(SR * d)) / SR

dry = np.zeros((N, 2)); send = np.zeros((N, 2))

def place(sig, t0, gain=1.0, pan=0.0, rev=0.25):
    i0 = int(t0 * SR)
    if i0 >= N: return
    s = sig[: N - i0] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    st = np.stack([s * l, s * r], 1) * np.sqrt(2)
    dry[i0:i0 + len(s)] += st
    send[i0:i0 + len(s)] += st * rev

def env(n, a, d, sus=0.0, rel=None):
    a_n = max(1, int(a * SR)); e = np.ones(n)
    e[:a_n] = np.linspace(0, 1, a_n)
    rest = n - a_n
    if rest > 0: e[a_n:] = sus + (1 - sus) * np.exp(-np.arange(rest) / (d * SR))
    if rel:
        r_n = min(n, int(rel * SR)); e[-r_n:] *= np.linspace(1, 0, r_n)
    return e

def lowpass(x, cutoff):
    """one-pole lowpass; cutoff may be an array"""
    c = np.broadcast_to(np.asarray(cutoff, float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc); y[i] = acc
    return y

# ---------- instruments ----------
def pluck(m, d=0.6, bright=1.0):
    t = tt(d); f = hz(m)
    s = np.sin(2 * np.pi * f * t) + 0.35 * bright * np.sin(4 * np.pi * f * t) * np.exp(-t * 18) + 0.12 * bright * np.sin(6 * np.pi * f * t) * np.exp(-t * 30)
    return s * env(len(t), 0.004, 0.16 + 0.1 * (1 - bright), rel=0.05)

def bell(m, d=2.5):
    t = tt(d); f = hz(m)
    s = np.sin(2 * np.pi * f * t + 1.2 * np.sin(2 * np.pi * f * 3.5 * t) * np.exp(-t * 3))
    return s * env(len(t), 0.003, 0.9, rel=0.3)

def pad(notes, d, cutoff_from=500, cutoff_to=2200, a=0.6):
    t = tt(d); s = np.zeros_like(t)
    for m in notes:
        for det in (-0.09, 0.0, 0.08):
            ph = rng.uniform(0, 2 * np.pi)
            s += (2 * ((hz(m + det) * t + ph / (2 * np.pi)) % 1) - 1) * 0.33
    s /= len(notes)
    s = lowpass(s, np.linspace(cutoff_from, cutoff_to, len(t)))
    return s * env(len(t), a, 99, sus=1.0, rel=min(0.8, d * 0.4))

def bass(m, d):
    t = tt(d); f = hz(m)
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    return np.tanh(1.4 * s) * env(len(t), 0.006, 0.22, sus=0.35, rel=0.04)

def kick():
    t = tt(0.45); f = 48 + 90 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)

def hat():
    t = tt(0.06); n = rng.standard_normal(len(t)); n = n - lowpass(n, 7000)
    return n * np.exp(-t * 70)

def whoosh(d=0.7, peak=0.6, lo=300, hi=3500):
    t = tt(d); n = rng.standard_normal(len(t))
    shape = np.sin(np.clip(t / d, 0, 1) * np.pi) ** 2 * np.exp(-((t / d - peak) ** 2) * 2)
    cut = lo + (hi - lo) * np.sin(np.clip(t / d, 0, 1) * np.pi)
    return lowpass(n, cut) * shape

def tick():
    t = tt(0.05); n = rng.standard_normal(len(t))
    return lowpass(n, 4000) * np.exp(-t * 120)

# ---------- harmony (D major: Bm G D A) ----------
# MIDI: B=59/47, D=62/50, G=55/43, A=57/45, F#=66/54
CH = {'Bm': [47, 59, 62, 66], 'G': [43, 55, 59, 62], 'D': [50, 57, 62, 66], 'A': [45, 57, 61, 64]}
ARP = {'Bm': [71, 74, 78, 74], 'G': [67, 71, 74, 71], 'D': [69, 74, 78, 74], 'A': [69, 73, 76, 73]}
prog_ = [(3, 'Bm'), (5, 'G'), (7, 'D'), (9, 'A'), (11, 'Bm'), (13, 'G'), (15, 'A')]
BEAT = 0.5

# hook: filtered Bm pad swelling, then the beat drops at 3.0
place(pad([59, 62, 66, 71], 3.4, 400, 2000, a=0.25), 0.0, 0.30, rev=0.5)
# counter plucks: B minor pentatonic climbing with the 2.85 → 9.15 count (0.3 – 1.75, easeInOut)
pent = [59, 62, 64, 66, 69, 71, 74, 76, 78, 81]
ease = lambda k: 4 * k ** 3 if k < .5 else 1 - (-2 * k + 2) ** 3 / 2
ks = np.linspace(0, 1, 2001); ev = np.array([ease(k) for k in ks])
for i, m in enumerate(pent[:-1]):
    level = (i + 0.5) / (len(pent) - 1)          # note fires as the counter crosses evenly spaced levels
    tn = 0.3 + 1.45 * ks[np.searchsorted(ev, level)]
    place(pluck(m, 0.5), tn, 0.17 + 0.06 * i / 9, pan=-0.4 + 0.8 * i / 9, rev=0.4)
# landing at 9.15%: soft bell chord + sub
for m, p in ((74, -0.2), (78, 0.2), (83, 0)):
    place(bell(m, 2.2), 1.76, 0.12, pan=p, rev=0.6)
place(np.sin(2 * np.pi * hz(38) * tt(1.0)) * env(SR, 0.01, 0.35), 1.76, 0.22, rev=0.1)
# riser into the drop
place(whoosh(1.0, 0.85, 200, 5000), 2.05, 0.16, rev=0.5)

for (t0, c) in prog_:
    d = 2.0 if t0 < 15 else 1.0
    place(pad(CH[c][1:], d + 0.3, 700, 1800, a=0.08), t0, 0.12, rev=0.5)
    for b in range(int(d / BEAT * 2)):  # 8ths
        tb = t0 + b * BEAT / 2
        place(bass(CH[c][0], BEAT / 2 * 0.9), tb, 0.20 if b % 2 == 0 else 0.13, rev=0.02)
        place(pluck(ARP[c][b % 4] + (12 if (b // 4) % 2 and c != 'A' else 0), 0.35, 0.8), tb, 0.055, pan=0.35 if b % 2 else -0.35, rev=0.35)
for b in range(int((16 - 3) / BEAT)):
    tb = 3 + b * BEAT
    place(kick(), tb, 0.42, rev=0.03)
    place(hat(), tb + BEAT / 2, 0.035, pan=0.25, rev=0.15)

# scene transitions (soft, filtered, under the music)
place(whoosh(0.8, 0.5), 7.1, 0.06, pan=-0.2, rev=0.5)
place(whoosh(0.7, 0.55), 11.15, 0.07, pan=0.2, rev=0.5)
place(whoosh(1.0, 0.7, 250, 2500), 15.35, 0.07, rev=0.6)

# cursor clicks: tick + a quiet pitched note in key
for tc, m in ((8.95, 78), (10.55, 81)):
    place(tick(), tc, 0.09, pan=-0.1, rev=0.1)
    place(pluck(m, 0.4), tc, 0.05, pan=-0.1, rev=0.4)

# screener rows lighting up: D major pentatonic, ascending, quiet
rowpent = [74, 76, 78, 81, 83, 86, 88, 90]
for i in range(HL_ROWS):
    place(pluck(rowpent[i % len(rowpent)], 0.4), 12.35 + i * 0.22, 0.045, pan=0.3, rev=0.45)

# outro: resolve to D major at 16.0, groove drops out
place(kick(), 16.0, 0.45, rev=0.1)
place(np.sin(2 * np.pi * hz(38) * tt(2.0)) * env(2 * SR, 0.01, 0.8), 16.0, 0.2, rev=0.1)
place(pad([50, 57, 62, 66, 69], 4.0, 600, 2600, a=0.05), 16.0, 0.30, rev=0.6)
for m, dt, p in ((74, 0.0, -0.2), (78, 0.08, 0.2), (81, 0.16, 0.0)):
    place(bell(m, 3.8), 16.0 + dt, 0.09, pan=p, rev=0.7)
# logo line draws + URL pops: two soft notes
place(pluck(86, 0.6), 16.75, 0.04, pan=0.3, rev=0.6)
place(bell(90, 2.5), 17.0, 0.035, pan=-0.2, rev=0.7)

# ---------- reverb (shared space) ----------
irn = int(1.8 * SR); ti = np.arange(irn) / SR
ir = np.stack([rng.standard_normal(irn), rng.standard_normal(irn)], 1) * np.exp(-ti * 3.2)[:, None]
ir[:, 0] = lowpass(ir[:, 0], 5000); ir[:, 1] = lowpass(ir[:, 1], 5000)
ir /= np.sqrt((ir ** 2).sum(0))
L = 1 << int(np.ceil(np.log2(N + irn)))
wet = np.stack([np.fft.irfft(np.fft.rfft(send[:, c], L) * np.fft.rfft(ir[:, c], L), L)[:N] for c in range(2)], 1)
mix = dry + wet * 0.55

# gentle glue: lowpass-ish tilt, soft clip, fades, normalize
mix = np.tanh(mix * 1.2) / 1.2
fi, fo = int(0.03 * SR), int(1.4 * SR)
mix[:fi] *= np.linspace(0, 1, fi)[:, None]
mix[-fo:] *= (np.linspace(1, 0, fo) ** 1.5)[:, None]
rms = np.sqrt((mix ** 2).mean())
mix *= min(0.16 / rms, 0.89 / np.abs(mix).max())
print('peak', np.abs(mix).max(), 'rms', np.sqrt((mix ** 2).mean()))

with wave.open('soundtrack.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype('<i2').tobytes())
