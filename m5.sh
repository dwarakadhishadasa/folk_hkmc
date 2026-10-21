{
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"p","version":"1"}}}\n'
sleep 2
printf '{"jsonrpc":"2.0","method":"notifications/initialized"}\n'
sleep 2
printf '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"command_list","arguments":{"filter":"layer.new.layer"}}}\n'
sleep 10
} | timeout 40 photocraft.cli mcp --bridge 127.0.0.1:7718 --control-token-file ~/snap/photocraft/common/control/token >/dev/null 2>&1
