const getUsernameFromHeaders = (headers) => {
  const nightbotSendUser = headers["nightbot-user"];
  const fossabotSendUser = headers["x-fossabot-message-userlogin"];

  if (nightbotSendUser) {
    const params = new URLSearchParams(nightbotSendUser);
    return params.get("displayName");
  } else if (fossabotSendUser) {
    return fossabotSendUser;
  }

  return null;
};

const getChannelFromHeaders = (headers) => {
  const nightbotChannel = headers["nightbot-channel"];
  const fossabotChannel = headers["x-fossabot-channellogin"];

  if (nightbotChannel) {
    const params = new URLSearchParams(nightbotChannel);
    return params.get("name");
  } else if (fossabotChannel) {
    return fossabotChannel;
  }

  return null;
};

export { getUsernameFromHeaders, getChannelFromHeaders };
