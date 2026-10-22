using System.Numerics;
using Dalamud.Bindings.ImGui;
using Dalamud.Interface.Utility.Raii;
using Dalamud.Interface.Windowing;
using Dalamud.Plugin;
using Dalamud.Utility;

namespace Clavicule.Plugin;

/// <summary>Fenêtre /clavicule : état, envoi manuel, confirmation Lodestone si besoin. Rien d'obligatoire à saisir.</summary>
public sealed class ConfigWindow : Window
{
    private const string LodestoneProfileSettings = "https://eu.finalfantasyxiv.com/lodestone/my/setting/profile/";
    private static readonly int[] TextureSizes = [512, 1024, 2048];

    private readonly IDalamudPluginInterface pluginInterface;
    private readonly Configuration config;
    private readonly Exporter exporter;
    private readonly PrivateSync privateSync;
    private string? pairingCode;
    private DateTime pairingExpires;
    private IReadOnlyList<Clavicule.Sync.SyncClient.PairedDevice>? devices;
    private string message = "";
    private bool working;

    public ConfigWindow(IDalamudPluginInterface pluginInterface, Configuration config, Exporter exporter, PrivateSync privateSync)
        : base("Clavicule###clavicule-config")
    {
        this.pluginInterface = pluginInterface;
        this.config = config;
        this.exporter = exporter;
        this.privateSync = privateSync;
        SizeConstraints = new WindowSizeConstraints { MinimumSize = new Vector2(440, 280), MaximumSize = new Vector2(900, 900) };
    }

    private void Save() => pluginInterface.SavePluginConfig(config);

    /// <summary>Lance une action réseau sans bloquer le jeu, et affiche son résultat.</summary>
    private void Run(Func<Task<string>> action)
    {
        working = true;
        message = "…";
        _ = action().ContinueWith(t =>
        {
            message = t.IsFaulted ? t.Exception!.GetBaseException().Message : t.Result;
            working = false;
        });
    }

    public override void Draw()
    {
        ImGui.TextWrapped("Ton personnage apparaît en 3D dans l’appli Clavicule. Son apparence est envoyée à la connexion et à chaque changement de tenue : il n’y a rien à configurer.");
        ImGui.Spacing();

        if (!config.IsReady)
        {
            ImGui.TextColored(new Vector4(1f, 0.6f, 0.3f, 1f), "Aucun service de synchro n’est configuré dans cette version du plugin.");
        }

        var current = exporter.CurrentCharacter();
        if (current is not { } c)
        {
            ImGui.TextDisabled("Connecte-toi avec un personnage.");
            DrawAdvanced(null);
            return;
        }
        var state = c.state;

        ImGui.TextUnformatted($"{state.Name} ({state.World})");
        ImGui.TextUnformatted(state.LastUpload is { } last ? $"Dernier envoi : {last.ToLocalTime():dd/MM/yyyy HH:mm}" : "Pas encore envoyé.");
        ImGui.TextWrapped(exporter.Status);
        ImGui.Spacing();

        if (state.NeedsLodestoneProof)
        {
            DrawProof(state);
        }
        else
        {
            using (ImRaii.Disabled(exporter.Busy || !config.IsReady))
            {
                if (ImGui.Button(exporter.Busy ? "Envoi en cours…" : "Envoyer maintenant")) exporter.SendNow();
            }
            var auto = config.AutoUpload;
            ImGui.SameLine();
            if (ImGui.Checkbox("Envoi automatique", ref auto))
            {
                config.AutoUpload = auto;
                Save();
            }
        }

        if (message.Length > 0) ImGui.TextWrapped(message);
        DrawMobile(state);
        DrawAdvanced(state);
    }

    /// <summary>Le personnage est lié à un autre PC (réinstallation, nouveau PC) : on le prouve avec le Lodestone.</summary>
    private void DrawProof(CharacterState state)
    {
        ImGui.Separator();
        ImGui.TextColored(new Vector4(1f, 0.8f, 0.4f, 1f), "Ce personnage est déjà lié à un autre ordinateur.");
        ImGui.TextWrapped("C’est normal après un changement de PC. Pour le confirmer, colle un code dans ta présentation Lodestone, le temps de la vérification.");
        ImGui.Spacing();

        using (ImRaii.Disabled(working))
        {
            if (state.ProofCode == null)
            {
                if (ImGui.Button("1. Obtenir mon code")) Run(() => exporter.RequestProofCode(state));
                return;
            }

            ImGui.TextUnformatted("Ton code :");
            ImGui.SameLine();
            ImGui.TextColored(new Vector4(0.9f, 0.8f, 0.5f, 1f), state.ProofCode);
            ImGui.SameLine();
            if (ImGui.SmallButton("Copier")) ImGui.SetClipboardText(state.ProofCode);

            if (ImGui.Button("2. Ouvrir ma présentation Lodestone")) Util.OpenLink(LodestoneProfileSettings);
            ImGui.SameLine();
            if (ImGui.Button("3. Vérifier")) Run(() => exporter.VerifyProofCode(state));
            if (ImGui.SmallButton("Nouveau code")) Run(() => exporter.RequestProofCode(state));
        }
    }

    /// <summary>Inventaire, servants et courrier dans l'appli : association d'un téléphone par code.</summary>
    private void DrawMobile(CharacterState state)
    {
        ImGui.Spacing();
        if (!ImGui.CollapsingHeader("Appli mobile : inventaire, servants, courrier", ImGuiTreeNodeFlags.DefaultOpen)) return;
        if (!PrivateSync.IsLinked(state))
        {
            ImGui.TextWrapped("Envoie d’abord ton apparence (« Envoyer maintenant ») : c’est ce qui relie ton personnage à ce PC.");
            return;
        }
        ImGui.TextWrapped("Ces données ne sont visibles que sur les téléphones que tu connectes avec un code. Inventaire des servants : ouvre-les une fois à la sonnette. Courrier : ouvre ta boîte aux lettres.");

        var enabled = config.PrivateSync;
        if (ImGui.Checkbox("Envoyer inventaire, servants et courrier", ref enabled))
        {
            config.PrivateSync = enabled;
            Save();
            if (enabled) privateSync.SendSoon();
        }
        ImGui.SameLine();
        ImGui.TextDisabled(privateSync.Status);

        using (ImRaii.Disabled(working))
        {
            if (ImGui.Button("Connecter un téléphone"))
            {
                Run(async () =>
                {
                    var (code, result) = await privateSync.CreatePairing(state);
                    if (code == null) return result.Message;
                    pairingCode = code.Code;
                    pairingExpires = code.ExpiresAt;
                    privateSync.SendSoon();
                    return "Dans l’appli : fiche de ton personnage → « Connecter », puis saisis ce code.";
                });
            }
            ImGui.SameLine();
            if (ImGui.Button("Téléphones connectés"))
            {
                Run(async () =>
                {
                    var (list, result) = await privateSync.ListDevices(state);
                    devices = list;
                    return result.Message;
                });
            }
        }

        if (pairingCode != null && pairingExpires > DateTime.UtcNow)
        {
            var left = pairingExpires - DateTime.UtcNow;
            ImGui.SetWindowFontScale(2f);
            ImGui.TextColored(new Vector4(0.9f, 0.8f, 0.5f, 1f), $"{pairingCode[..3]} {pairingCode[3..]}");
            ImGui.SetWindowFontScale(1f);
            ImGui.TextDisabled($"Valable encore {left.Minutes} min {left.Seconds:00} s, une seule fois.");
        }

        if (devices != null)
        {
            if (devices.Count == 0) ImGui.TextDisabled("Aucun téléphone connecté.");
            foreach (var d in devices)
            {
                ImGui.TextUnformatted($"• {d.Name} (depuis le {d.CreatedAt.ToLocalTime():dd/MM/yyyy})");
                ImGui.SameLine();
                using (ImRaii.Disabled(working))
                {
                    if (ImGui.SmallButton($"Retirer##{d.Id}"))
                    {
                        var target = d;
                        Run(async () =>
                        {
                            var result = await privateSync.RevokeDevice(state, target.Id);
                            if (result.Ok) devices = devices.Where(x => x.Id != target.Id).ToList();
                            return result.Message;
                        });
                    }
                }
            }
        }
    }

    private void DrawAdvanced(CharacterState? state)
    {
        ImGui.Spacing();
        if (!ImGui.CollapsingHeader("Options")) return;

        var weapons = config.IncludeWeapons;
        if (ImGui.Checkbox("Inclure les armes", ref weapons))
        {
            config.IncludeWeapons = weapons;
            Save();
        }
        var normals = config.Normals;
        if (ImGui.Checkbox("Relief des textures (fichier plus lourd)", ref normals))
        {
            config.Normals = normals;
            Save();
        }
        var sizeIndex = Math.Max(0, Array.IndexOf(TextureSizes, config.MaxTextureSize));
        if (ImGui.Combo("Taille des textures", ref sizeIndex, ["512 (léger)", "1024 (conseillé)", "2048 (lourd)"]))
        {
            config.MaxTextureSize = TextureSizes[sizeIndex];
            Save();
        }

        if (state != null)
        {
            var id = state.LodestoneId?.ToString() ?? "";
            if (ImGui.InputText("Identifiant Lodestone", ref id, 20, ImGuiInputTextFlags.CharsDecimal))
            {
                state.LodestoneId = long.TryParse(id, out var parsed) ? parsed : null;
                Save();
            }
            ImGui.TextDisabled("Trouvé automatiquement. À corriger seulement en cas d’erreur.");

            using (ImRaii.Disabled(working || exporter.Busy || !config.IsReady || state.NeedsLodestoneProof))
            {
                if (ImGui.Button("Envoyer un diagnostic des couleurs")) exporter.SendNow(diagnostics: true);
            }
            ImGui.TextDisabled("Renvoie le modèle avec les données brutes des matériaux, pour corriger les couleurs.");

            using (ImRaii.Disabled(working || state.LastUpload == null))
            {
                if (ImGui.Button("Retirer mon modèle de l’appli")) Run(() => exporter.DeleteModel(state));
            }
        }

        ImGui.Separator();
        ImGui.TextDisabled("Développement");
        var url = config.ServiceUrlOverride;
        if (ImGui.InputText("Autre service", ref url, 256))
        {
            config.ServiceUrlOverride = url.Trim();
            Save();
        }
        using (ImRaii.Disabled(working || !config.IsReady))
        {
            if (ImGui.Button("Tester le service")) Run(exporter.TestConnection);
        }
    }
}
