-- Expect text to be defined in the example script otherwise set it here
if text == nil then
    local text = "Hello World!"
end

-- Loop every second
function loop()
    -- Send the text to any output we can
    if gcs ~= nil then
        gcs:send_text(0, text)
    elseif notify ~= nil then
        notify:send_text(text, 1)
    elseif periph ~= nil then
        periph:can_printf(text);
    end
    return loop, 1000
end

-- Wait 1 second for the device to initialize
return loop, 1000
