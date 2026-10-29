const REPO = "andersonptg/DaNikeAI";
const API_URL = `https://api.github.com/repos/${REPO}/releases`;

async function carregarVersoes() {
    try {
        const resposta = await fetch(API_URL);

        if (!resposta.ok) {
            throw new Error("Falha ao consultar o GitHub.");
        }

        const releasesRecebidas = await resposta.json();

        function numeroVersao(valor) {
            return valor.replace(/^v/i, "").split(".").map(n => parseInt(n, 10) || 0);
        }

        function compararVersoes(a, b) {
            const va = numeroVersao(a);
            const vb = numeroVersao(b);

            for (let i = 0; i < 3; i++) {
                if ((va[i] || 0) > (vb[i] || 0)) return 1;
                if ((va[i] || 0) < (vb[i] || 0)) return -1;
            }

            return 0;
        }

        const releases = releasesRecebidas
            .filter(release => /^v?\d+\.\d+\.\d+$/i.test(release.tag_name || ""))
            .sort((a, b) => compararVersoes(
                b.tag_name.replace(/^v/i, ""),
                a.tag_name.replace(/^v/i, "")
            ));

        if (!releases.length) {
            console.warn("Nenhuma versão semântica encontrada.");
            return;
        }

        const releaseAtual = releases[0];
        const versaoAtual = releaseAtual.tag_name.replace(/^v/i, "");
        const releasesVisiveis = releases;

        // Atualiza a versão principal
        const elementoVersao = document.querySelector(".current-version strong");

        if (elementoVersao) {
            elementoVersao.textContent = versaoAtual;
        }

        // Atualiza a lista de versões
        const lista = document.querySelector(".version-list");

        if (lista) {
            lista.innerHTML = "";

            releasesVisiveis.forEach((release, indice) => {
                const versao =
                    release.tag_name?.replace(/^v/i, "") || "—";

                const item = document.createElement("div");
                item.className = "version-item";

                if (indice === 0) {
                    item.classList.add("active");
                }

                const info = document.createElement("div");

                const nome = document.createElement("strong");
                nome.textContent = `NEXO ${versao}`;

                const status = document.createElement("span");
                status.textContent =
                    indice === 0
                        ? "Versão atual"
                        : "Versão anterior";

                info.appendChild(nome);
                info.appendChild(status);

                const link = document.createElement("a");

                const apk = release.assets?.find(
                    asset => asset.name.toLowerCase().endsWith(".apk")
                );

                link.href = apk
                    ? apk.browser_download_url
                    : release.html_url;

                link.textContent = "BAIXAR";

                link.target = "_blank";
                link.rel = "noopener noreferrer";

                item.appendChild(info);
                item.appendChild(link);

                lista.appendChild(item);
            });
        }

        console.log(
            `NEXO: ${versaoAtual} carregada automaticamente.`
        );

    } catch (erro) {
        console.error("Erro ao carregar versões:", erro);
    }
}

carregarVersoes();


/* =========================================================
   NEXO — Scanner + sons eletrônicos
   ========================================================= */

(() => {
    const orb = document.getElementById("aiOrb");

    if (!orb) return;

    let scannerAtivo = true;
    let audioContext = null;

    function iniciarAudio() {
        if (!audioContext) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;

            if (!AudioCtx) return null;

            audioContext = new AudioCtx();
        }

        if (audioContext.state === "suspended") {
            audioContext.resume();
        }

        return audioContext;
    }

    function somScanner() {
        const ctx = iniciarAudio();

        if (!ctx) return;

        const agora = ctx.currentTime;

        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(420, agora);
        osc.frequency.exponentialRampToValueAtTime(920, agora + .12);

        ganho.gain.setValueAtTime(.0001, agora);
        ganho.gain.exponentialRampToValueAtTime(.09, agora + .015);
        ganho.gain.exponentialRampToValueAtTime(.0001, agora + .18);

        osc.connect(ganho);
        ganho.connect(ctx.destination);

        osc.start(agora);
        osc.stop(agora + .2);
    }

    function somDesligar() {
        const ctx = iniciarAudio();

        if (!ctx) return;

        const agora = ctx.currentTime;

        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(760, agora);
        osc.frequency.exponentialRampToValueAtTime(180, agora + .22);

        ganho.gain.setValueAtTime(.0001, agora);
        ganho.gain.exponentialRampToValueAtTime(.075, agora + .01);
        ganho.gain.exponentialRampToValueAtTime(.0001, agora + .25);

        osc.connect(ganho);
        ganho.connect(ctx.destination);

        osc.start(agora);
        osc.stop(agora + .27);
    }

    function flashDuplo() {
        orb.classList.remove("flash-active");

        void orb.offsetWidth;

        orb.classList.add("flash-active");

        setTimeout(() => {
            orb.classList.remove("flash-active");
        }, 500);
    }

    orb.addEventListener("click", () => {

        scannerAtivo = !scannerAtivo;

        iniciarAudio();

        if (scannerAtivo) {
            orb.classList.remove("scanner-off");
            somScanner();
        } else {
            orb.classList.add("scanner-off");
            somDesligar();
            flashDuplo();
        }
    });

    orb.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            orb.click();
        }
    });

    orb.setAttribute("tabindex", "0");
})();


/* NEXO Space — distribuição automática do APK */
(async () => {
  const API = "https://api.github.com/repos/andersonptg/DaNikeAI/releases/latest";
  const FALLBACK = "https://github.com/andersonptg/DaNikeAI/releases/latest/download/NEXO.apk";

  try {
    const r = await fetch(API, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error("GitHub API " + r.status);

    const release = await r.json();
    const apk = (release.assets || []).find(a =>
      String(a.name).toLowerCase() === "nexo.apk"
    );

    const url = apk?.browser_download_url || FALLBACK;
    const tag = release.tag_name || "Última versão";

    document.querySelectorAll('a[href*=".apk"], #download, .download-btn, [data-download]').forEach(el => {
      el.href = url;
      el.setAttribute("download", "");
    });

    document.querySelectorAll(
      "[data-version], .version, #version, .current-version strong"
    ).forEach(el => {
      el.textContent = tag.replace(/^v/i, "");
    });

    document.querySelectorAll("[data-download-text]").forEach(el => {
      el.textContent = "Baixar NEXO Space " + tag;
    });
  } catch (e) {
    console.warn("Não foi possível consultar o último Release:", e);
  }
})();
