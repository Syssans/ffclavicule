using Dalamud.Plugin.Services;
using Microsoft.Extensions.Logging;

namespace Clavicule.Plugin;

/// <summary>Relaie les journaux de Meddle vers celui de Dalamud (/xllog).</summary>
public sealed class DalamudLogger<T>(IPluginLog log) : ILogger<T>
{
    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

    public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;

    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
    {
        if (!IsEnabled(logLevel)) return;
        var message = $"[{typeof(T).Name}] {formatter(state, exception)}";
        switch (logLevel)
        {
            case LogLevel.Critical:
            case LogLevel.Error:
                log.Error(exception, message);
                break;
            case LogLevel.Warning:
                log.Warning(exception, message);
                break;
            default:
                log.Debug(exception, message);
                break;
        }
    }
}
