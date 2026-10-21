# Image d'une session de jeu : un bureau Wayland minimal (fourni par Games on Whales)
# + XIVLauncher.Core, le launcher FFXIV open source pour Linux.
# Wolf démarre un conteneur de cette image par joueur connecté.

ARG BASE_APP_IMAGE=ghcr.io/games-on-whales/base-app:edge

#################################
# 1. Compilation de XIVLauncher.Core
#################################
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS xlcore

ARG XLCORE_VERSION=1.4.0

RUN git clone --recurse-submodules --shallow-submodules --depth 1 \
      --branch "${XLCORE_VERSION}" https://github.com/goatcorp/XIVLauncher.Core.git /src

WORKDIR /src/src/XIVLauncher.Core
RUN dotnet publish -c Release -r linux-x64 --self-contained -o /out \
    && rm -f /out/*.pdb /out/*.xml

#################################
# 2. Image de session
#################################
# hadolint ignore=DL3006
FROM ${BASE_APP_IMAGE}

ARG DEBIAN_FRONTEND=noninteractive

# Wine (64 et 32 bits) est installé pour ses dépendances système :
# XIVLauncher télécharge ensuite sa propre version de Wine optimisée pour FFXIV.
RUN dpkg --add-architecture i386 \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        wine64 wine32:i386 \
        libvulkan1 libvulkan1:i386 mesa-vulkan-drivers mesa-vulkan-drivers:i386 \
        libicu76 libsecret-1-0 libdecor-0-0 libxss1 \
        xdg-utils zenity ca-certificates \
        fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

COPY --from=xlcore /out /opt/xlcore
COPY --chmod=755 startup-app.sh /opt/gow/startup-app.sh
COPY --chmod=755 show-error.sh /opt/ffclavicule/show-error.sh
COPY sway-ffxiv.conf /etc/sway/config.d/90-ffxiv.conf

# Le jeu partagé est monté ici par Wolf (lecture seule pour les joueurs).
ENV FFXIV_GAME_PATH=/ffxiv

LABEL org.opencontainers.image.source="https://github.com/syssans/ffclavicule"
