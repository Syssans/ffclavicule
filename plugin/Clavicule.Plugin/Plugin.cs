using Dalamud.Game.Command;
using Dalamud.Interface.Windowing;
using Dalamud.Plugin;
using Dalamud.Plugin.Services;

namespace Clavicule.Plugin;

public sealed class Plugin : IDalamudPlugin
{
    private const string Command = "/clavicule";

    private readonly IDalamudPluginInterface pluginInterface;
    private readonly ICommandManager commands;
    private readonly WindowSystem windows = new("Clavicule");
    private readonly MeddleBridge meddle;
    private readonly Exporter exporter;
    private readonly PrivateSync privateSync;
    private readonly ConfigWindow configWindow;

    public Plugin(
        IDalamudPluginInterface pluginInterface,
        ICommandManager commands,
        IFramework framework,
        IObjectTable objects,
        ICondition condition,
        IClientState clientState,
        INotificationManager notifications,
        ISigScanner sigScanner,
        IGameInteropProvider gameInterop,
        IDataManager dataManager,
        IPluginLog log)
    {
        this.pluginInterface = pluginInterface;
        this.commands = commands;
        var config = pluginInterface.GetPluginConfig() as Configuration ?? new Configuration();

        meddle = new MeddleBridge(pluginInterface, log, sigScanner, gameInterop, dataManager);
        exporter = new Exporter(pluginInterface, config, framework, objects, condition, clientState, notifications, log, meddle);
        privateSync = new PrivateSync(pluginInterface, config, framework, objects, log, exporter);
        configWindow = new ConfigWindow(pluginInterface, config, exporter, privateSync);
        windows.AddWindow(configWindow);

        pluginInterface.UiBuilder.Draw += windows.Draw;
        pluginInterface.UiBuilder.OpenConfigUi += OpenWindow;
        pluginInterface.UiBuilder.OpenMainUi += OpenWindow;
        commands.AddHandler(Command, new CommandInfo(OnCommand)
        {
            HelpMessage = "Ouvre les réglages de Clavicule. « /clavicule envoyer » envoie ton apparence tout de suite.",
        });
    }

    private void OpenWindow() => configWindow.IsOpen = true;

    private void OnCommand(string command, string args)
    {
        if (args.Trim().Equals("envoyer", StringComparison.OrdinalIgnoreCase)) exporter.SendNow();
        else configWindow.Toggle();
    }

    public void Dispose()
    {
        commands.RemoveHandler(Command);
        pluginInterface.UiBuilder.Draw -= windows.Draw;
        pluginInterface.UiBuilder.OpenConfigUi -= OpenWindow;
        pluginInterface.UiBuilder.OpenMainUi -= OpenWindow;
        windows.RemoveAllWindows();
        privateSync.Dispose();
        exporter.Dispose();
        meddle.Dispose();
    }
}
