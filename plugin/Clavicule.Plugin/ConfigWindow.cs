using System.Numerics;
using Dalamud.Bindings.ImGui;
using Dalamud.Interface.Utility.Raii;
using Dalamud.Interface.Windowing;
using Dalamud.Plugin;

namespace Clavicule.Plugin;

/// <summary>Fenêtre /clavicule : adresse du service, clé, identifiant Lodestone, envoi manuel.</summary>
public sealed class ConfigWindow : Window
{
    private static readonly int[] TextureSizes = [512, 1024, 2048];

    private readonly IDalamudPluginInterface pluginInterface;
    private readonly Configuration config;
    private readonly Exporter exporter;
    private string connection = "";

    public ConfigWindow(IDalamudPluginInterface pluginInterface, Configuration config, Exporter exporter)
        : base("Clavicule###clavicule-config")
    {
        this.pluginInterface = pluginInterface;
        this.config = config;
        this.exporter = exporter;
        SizeConstraints = new WindowSizeConstraints { MinimumSize = new Vector2(420, 300), MaximumSize = new Vector2(900, 900) };
    }

    private void Save() => pluginInterface.SavePluginConfig(config);

    public override void Draw()
    {
        ImGui.TextWrapped("Envoie l’apparence 3D de ton personnage à l’appli Clavicule, à la connexion et à chaque changement de tenue.");
        ImGui.Separator();

        var url = config.ServiceUrl;
        if (ImGui.InputText("Adresse du service", ref url, 256))
        {
            config.ServiceUrl = url.Trim();
            Save();
        }
        var key = config.WriteKey;
        if (ImGui.InputText("Clé d’écriture", ref key, 256, ImGuiInputTextFlags.Password))
        {
            config.WriteKey = key.Trim();
            Save();
        }
        if (ImGui.Button("Tester la connexion"))
        {
            connection = "Test…";
            _ = exporter.TestConnection().ContinueWith(t => connection = t.IsFaulted ? t.Exception!.GetBaseException().Message : t.Result);
        }
        if (connection.Length > 0)
        {
            ImGui.SameLine();
            ImGui.TextUnformatted(connection);
        }

        ImGui.Separator();
        var current = exporter.CurrentCharacter();
        if (current is { } c)
        {
            ImGui.TextUnformatted($"Personnage : {c.state.Name} ({c.state.World})");
            var id = c.state.LodestoneId?.ToString() ?? "";
            if (ImGui.InputText("Identifiant Lodestone", ref id, 20, ImGuiInputTextFlags.CharsDecimal))
            {
                c.state.LodestoneId = long.TryParse(id, out var parsed) ? parsed : null;
                Save();
            }
            ImGui.TextDisabled("Laisse vide : il est retrouvé automatiquement. C’est le nombre dans l’adresse de ta fiche Lodestone.");
            ImGui.TextUnformatted(c.state.LastUpload is { } last
                                      ? $"Dernier envoi : {last.ToLocalTime():dd/MM/yyyy HH:mm}"
                                      : "Jamais envoyé.");
        }
        else
        {
            ImGui.TextDisabled("Connecte-toi avec un personnage.");
        }

        ImGui.Separator();
        var auto = config.AutoUpload;
        if (ImGui.Checkbox("Envoi automatique", ref auto))
        {
            config.AutoUpload = auto;
            Save();
        }
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

        ImGui.Separator();
        using (ImRaii.Disabled(exporter.Busy))
        {
            if (ImGui.Button(exporter.Busy ? "Envoi en cours…" : "Envoyer maintenant")) exporter.SendNow();
        }
        ImGui.SameLine();
        ImGui.TextWrapped(exporter.Status);
    }
}
