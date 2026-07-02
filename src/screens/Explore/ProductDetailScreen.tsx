// src/screens/Explore/ProductDetailScreen.tsx
import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function ProductDetailScreen({ route, navigation }) {
  const { product } = route.params;
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [orderId] = useState('ORD' + Date.now());

  // Mock product images
  const productImages = [
    product.image,
    require('../../../assets/images/foodecar.jpg'),
    require('../../../assets/images/sandwich.jpg'),
  ];

  const colors = ['Black', 'White', 'Blue', 'Red'];
  const sizes = ['S', 'M', 'L', 'XL'];

  const addToCart = () => {
    Alert.alert('Success', `Added ${quantity} ${product.title} to cart!`);
  };

  const buyNow = () => {
    setOrderConfirmed(true);
  };

  const continueShopping = () => {
    setOrderConfirmed(false);
    navigation.goBack(); // Go back to market screen
  };

  const viewOrderDetails = () => {
    Alert.alert('Order Details', `Order ID: ${orderId}\nTotal: ${product.price}`);
  };

  // Order Confirmation View
  if (orderConfirmed) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.confirmationContent}>
          {/* Success Icon */}
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
          </View>

          {/* Success Message */}
          <Text style={styles.successTitle}>Order Confirmed!</Text>
          <Text style={styles.successMessage}>
            Thank you for your purchase. Your order has been confirmed and will be shipped soon.
          </Text>

          {/* Order ID */}
          <View style={styles.orderIdContainer}>
            <Text style={styles.orderIdLabel}>Order ID:</Text>
            <Text style={styles.orderId}>{orderId}</Text>
          </View>

          {/* Order Summary */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Details</Text>
            <View style={styles.orderItem}>
              <Text style={styles.orderDate}>Order Date: {new Date().toLocaleDateString()}</Text>
              <Text style={styles.deliveryDate}>
                Estimated Delivery: 3-5 business days
              </Text>
            </View>
            
            <Text style={styles.itemsTitle}>Items Ordered:</Text>
            <View style={styles.itemRow}>
              <Text style={styles.itemName}>{product.title}</Text>
              <Text style={styles.itemQuantity}>x{quantity}</Text>
              <Text style={styles.itemPrice}>{product.price}</Text>
            </View>
            
            <View style={styles.totalContainer}>
              <Text style={styles.totalLabel}>Total Amount:</Text>
              <Text style={styles.totalAmount}>{product.price}</Text>
            </View>
          </View>

          {/* Next Steps */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What's Next?</Text>
            <View style={styles.step}>
              <Ionicons name="document-text-outline" size={20} color="#2c5aa0" />
              <Text style={styles.stepText}>You will receive an order confirmation email</Text>
            </View>
            <View style={styles.step}>
              <Ionicons name="time-outline" size={20} color="#2c5aa0" />
              <Text style={styles.stepText}>We'll notify you when your order ships</Text>
            </View>
            <View style={styles.step}>
              <Ionicons name="car-outline" size={20} color="#2c5aa0" />
              <Text style={styles.stepText}>Track your order with the provided tracking number</Text>
            </View>
          </View>
        </ScrollView>

        {/* Action Buttons - Reduced height */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={continueShopping}
          >
            <Text style={styles.primaryButtonText}>Continue Shopping</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={viewOrderDetails}
          >
            <Text style={styles.secondaryButtonText}>View Order Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Product Detail View
  return (
    <View style={styles.container}>
      {/* Header - Hide this when in stack navigator to avoid double header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000000ff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Product Details</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="heart-outline" size={24} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="share-outline" size={24} color="#333" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollView}>
        {/* Product Images */}
        <View style={styles.imageSection}>
          <Image source={productImages[selectedImage]} style={styles.mainImage} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailContainer}>
            {productImages.map((img, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => setSelectedImage(index)}
                style={[
                  styles.thumbnail,
                  selectedImage === index && styles.thumbnailActive
                ]}
              >
                <Image source={img} style={styles.thumbnailImage} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Product Info */}
        <View style={styles.infoSection}>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{product.price}</Text>
            {product.originalPrice && (
              <Text style={styles.originalPrice}>{product.originalPrice}</Text>
            )}
            {product.discount && (
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>{product.discount}</Text>
              </View>
            )}
          </View>

          <Text style={styles.productTitle}>{product.title}</Text>
          <Text style={styles.productSubtitle}>{product.subtitle}</Text>

          {/* Rating */}
          <View style={styles.ratingContainer}>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                  key={star}
                  name={star <= product.rating ? 'star' : 'star-outline'}
                  size={16}
                  color="#FFD700"
                />
              ))}
            </View>
            <Text style={styles.ratingText}>({product.reviews} reviews)</Text>
          </View>

          {/* Seller Info */}
          <View style={styles.sellerInfo}>
            <Text style={styles.sellerLabel}>Sold by:</Text>
            <Text style={styles.sellerName}>{product.seller}</Text>
            <Ionicons name="location-outline" size={16} color="#666" />
            <Text style={styles.sellerLocation}>{product.location}</Text>
          </View>

          {/* Description */}
          <View style={styles.descriptionSection}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descriptionText}>
              {product.description || 'No description available for this product.'}
            </Text>
          </View>

          {/* Color Selection */}
          <View style={styles.selectionSection}>
            <Text style={styles.sectionTitle}>Color</Text>
            <View style={styles.optionsContainer}>
              {colors.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    selectedColor === color && styles.colorOptionActive
                  ]}
                  onPress={() => setSelectedColor(color)}
                >
                  <Text style={[
                    styles.colorText,
                    selectedColor === color && styles.colorTextActive
                  ]}>
                    {color}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Size Selection */}
          <View style={styles.selectionSection}>
            <Text style={styles.sectionTitle}>Size</Text>
            <View style={styles.optionsContainer}>
              {sizes.map((size) => (
                <TouchableOpacity
                  key={size}
                  style={[
                    styles.sizeOption,
                    selectedSize === size && styles.sizeOptionActive
                  ]}
                  onPress={() => setSelectedSize(size)}
                >
                  <Text style={[
                    styles.sizeText,
                    selectedSize === size && styles.sizeTextActive
                  ]}>
                    {size}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Quantity Selector */}
          <View style={styles.quantitySection}>
            <Text style={styles.sectionTitle}>Quantity</Text>
            <View style={styles.quantityContainer}>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => setQuantity(Math.max(1, quantity - 1))}
              >
                <Ionicons name="remove" size={20} color="#333" />
              </TouchableOpacity>
              <Text style={styles.quantityText}>{quantity}</Text>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => setQuantity(quantity + 1)}
              >
                <Ionicons name="add" size={20} color="#333" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Features */}
          {product.features && (
            <View style={styles.featuresSection}>
              <Text style={styles.sectionTitle}>Features</Text>
              {product.features.map((feature, index) => (
                <View key={index} style={styles.featureItem}>
                  <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom Action Bar - Reduced height */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.cartButton} onPress={addToCart}>
          <Ionicons name="cart-outline" size={18} color="#2c5aa0" />
          <Text style={styles.cartButtonText}>Add to Cart</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buyButton} onPress={buyNow}>
          <Text style={styles.buyButtonText}>Buy Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#000000ff',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerIcons: {
    flexDirection: 'row',
  },
  iconButton: {
    padding: 4,
    marginLeft: 12,
  },
  scrollView: {
    flex: 1,
  },
  imageSection: {
    padding: 16,
  },
  mainImage: {
    width: width - 32,
    height: 300,
    borderRadius: 12,
  },
  thumbnailContainer: {
    flexDirection: 'row',
    marginTop: 12,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailActive: {
    borderColor: '#2c5aa0',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  infoSection: {
    padding: 16,
    paddingBottom: 100, // Add padding to prevent content from being hidden behind buttons
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  price: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c5aa0',
    marginRight: 8,
  },
  originalPrice: {
    fontSize: 16,
    color: '#999',
    textDecorationLine: 'line-through',
    marginRight: 8,
  },
  discountBadge: {
    backgroundColor: '#FF4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  discountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  productTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  productSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stars: {
    flexDirection: 'row',
    marginRight: 8,
  },
  ratingText: {
    fontSize: 14,
    color: '#666',
  },
  sellerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  sellerLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 4,
  },
  sellerName: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
  sellerLocation: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  descriptionSection: {
    marginBottom: 20,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#666',
  },
  selectionSection: {
    marginBottom: 20,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  colorOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  colorOptionActive: {
    borderColor: '#2c5aa0',
    backgroundColor: '#2c5aa0',
  },
  colorText: {
    fontSize: 14,
    color: '#333',
  },
  colorTextActive: {
    color: '#fff',
  },
  sizeOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  sizeOptionActive: {
    borderColor: '#2c5aa0',
    backgroundColor: '#2c5aa0',
  },
  sizeText: {
    fontSize: 14,
    color: '#333',
  },
  sizeTextActive: {
    color: '#fff',
  },
  quantitySection: {
    marginBottom: 20,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityButton: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginHorizontal: 16,
    minWidth: 30,
    textAlign: 'center',
  },
  featuresSection: {
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  // Reduced height for action bar and buttons
  actionBar: {
    flexDirection: 'row',
    padding: 12, // Reduced from 16
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fff',
    height: 70, // Fixed height
  },
  cartButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10, // Reduced from 16
    borderWidth: 2,
    borderColor: '#2c5aa0',
    borderRadius: 8,
    marginRight: 8, // Reduced from 12
    height: 46, // Fixed height
  },
  cartButtonText: {
    fontSize: 14, // Reduced from 16
    fontWeight: 'bold',
    color: '#2c5aa0',
    marginLeft: 6, // Reduced from 8
  },
  buyButton: {
    flex: 1,
    backgroundColor: '#2c5aa0',
    padding: 10, // Reduced from 16
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 46, // Fixed height
  },
  buyButtonText: {
    fontSize: 14, // Reduced from 16
    fontWeight: 'bold',
    color: '#fff',
  },
  // Order Confirmation Styles
  confirmationContent: {
    flexGrow: 1,
    padding: 16,
  },
  successIcon: {
    alignItems: 'center',
    marginVertical: 32,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#333',
  },
  successMessage: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 24,
    lineHeight: 22,
  },
  orderIdContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  orderIdLabel: {
    fontSize: 16,
    color: '#666',
    marginRight: 8,
  },
  orderId: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c5aa0',
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  orderItem: {
    marginBottom: 12,
  },
  orderDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  deliveryDate: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  itemsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  itemQuantity: {
    fontSize: 14,
    color: '#666',
    marginHorizontal: 8,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c5aa0',
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: '#f0f0f0',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c5aa0',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
  footer: {
    backgroundColor: '#fff',
    padding: 12, // Reduced from 16
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  primaryButton: {
    backgroundColor: '#2c5aa0',
    padding: 12, // Reduced from 16
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8, // Reduced from 12
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14, // Reduced from 16
    fontWeight: 'bold',
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: '#2c5aa0',
    padding: 12, // Reduced from 16
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#2c5aa0',
    fontSize: 14, // Reduced from 16
    fontWeight: 'bold',
  },
});