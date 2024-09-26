import Share from 'react-native-share';

export const handleShare = async (link: string) => {
  try {
    await Share.open({url: link});
  } catch (err) {
    console.error('Error sharing:', err);
  }
};
