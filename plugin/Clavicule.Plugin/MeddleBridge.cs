using Clavicule.Baking;
using Dalamud.Plugin;
using Dalamud.Plugin.Services;
using FFXIVClientStructs.FFXIV.Client.Game.Character;
using Meddle.Plugin.Models.Composer;
using Meddle.Plugin.Models.Layout;
using Meddle.Plugin.Services;
using Meddle.Plugin.Utils;
using SharpGLTF.Scenes;
using SharpGLTF.Schema2;
using SharpGLTF.Validation;
using MeddleExportConfiguration = Meddle.Plugin.Configuration.ExportConfiguration;

namespace Clavicule.Plugin;

/// <summary>
/// Utilise Meddle (sous-module vendor/Meddle) pour lire le personnage dans la mémoire du jeu
/// et reconstruire son modèle, puis cuit les matériaux et produit un .glb.
/// </summary>
public sealed unsafe class MeddleBridge : IDisposable
{
    private readonly HookManager hookManager;
    private readonly PbdHooks pbdHooks;
    private readonly StainProvider stains;
    private readonly Meddle.SqPack.SqPack pack;
    private readonly string workDir;

    public MeddleBridge(IDalamudPluginInterface pluginInterface, IPluginLog log, ISigScanner sigScanner, IGameInteropProvider gameInterop,
                        IDataManager dataManager)
    {
        // Bibliothèque native de décodage des textures (DirectXTex), livrée à côté du plugin.
        OtterTex.NativeDll.Initialize(pluginInterface.AssemblyLocation.DirectoryName);
        hookManager = new HookManager(new DalamudLogger<HookManager>(log), sigScanner, gameInterop);
        // Mémorise les déformations par race de l'équipement, créées au chargement des personnages.
        pbdHooks = new PbdHooks(new DalamudLogger<PbdHooks>(log), hookManager);
        // Remplit la liste statique des teintures, lue par Meddle pendant la lecture du personnage.
        stains = new StainProvider(new DalamudLogger<PbdHooks>(log), dataManager, hookManager);
        var gameDir = Path.GetDirectoryName(Environment.ProcessPath) ?? Environment.CurrentDirectory;
        pack = new Meddle.SqPack.SqPack(gameDir);
        workDir = Path.Combine(pluginInterface.GetPluginConfigDirectory(), "export");
        Task.Run(() => CleanCache(log));
    }

    /// <summary>Le cache de textures de Meddle accélère les exports suivants ; on retire ce qui n'a pas servi depuis un mois.</summary>
    private void CleanCache(IPluginLog log)
    {
        try
        {
            if (!Directory.Exists(workDir)) return;
            var limit = DateTime.UtcNow.AddDays(-30);
            foreach (var file in Directory.EnumerateFiles(workDir, "*", SearchOption.AllDirectories))
            {
                if (File.GetLastWriteTimeUtc(file) < limit) File.Delete(file);
            }
        }
        catch (Exception e)
        {
            log.Warning(e, "Nettoyage du cache d’export impossible");
        }
    }

    /// <summary>Lit le personnage (à appeler sur le thread du jeu).</summary>
    public ParsedCharacterInfo? Capture(Character* character, bool includeWeapons)
    {
        if (character == null || character->DrawObject == null) return null;
        var info = ParseMaterialUtil.ParseDrawObject(character->DrawObject, pbdHooks);
        if (info == null) return null;
        if (includeWeapons)
        {
            var weapons = new List<ParsedCharacterInfo>();
            foreach (var weapon in character->DrawData.WeaponData)
            {
                var weaponInfo = ParseMaterialUtil.ParseDrawObject(weapon.DrawData.DrawObject, pbdHooks);
                if (weaponInfo != null) weapons.Add(weaponInfo);
            }
            info.Attaches = weapons;
        }
        return info;
    }

    public sealed record BuildResult(byte[] Glb, BakeReport Report);

    /// <summary>Compose, cuit et sérialise le modèle (hors du thread du jeu).</summary>
    public BuildResult Build(ParsedCharacterInfo info, string name, BakeOptions options, CancellationToken ct)
    {
        Directory.CreateDirectory(workDir);
        var exportConfig = new MeddleExportConfiguration
        {
            // Pose actuelle du personnage (au repos : l'export n'a lieu que s'il est immobile).
            PoseMode = SkeletonUtils.PoseMode.Local,
            ApplyVisibilityFlags = true,
            UseDeformer = true,
        };
        var composer = new CharacterComposer(pack, exportConfig, workDir, ct);
        var scene = new SceneBuilder();
        var root = new NodeBuilder($"Character-{name}");
        scene.AddNode(root);
        composer.Compose(info, scene, root, new ExportProgress(info.Models.Count, "Character"));
        ct.ThrowIfCancellationRequested();

        var report = SceneBaker.Apply(scene, Path.Combine(workDir, "cache"), options);
        var model = scene.ToGltf2();
        var glb = model.WriteGLB(new WriteSettings { Validation = ValidationMode.TryFix, JsonIndented = false }).ToArray();
        return new BuildResult(glb, report);
    }

    public void Dispose()
    {
        stains.Dispose();
        pbdHooks.Dispose();
        hookManager.Dispose();
    }
}
